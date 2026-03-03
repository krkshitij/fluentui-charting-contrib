import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent } from "langchain";
import { AzureChatOpenAI } from "@langchain/openai";
import { ActivityTypes } from "@microsoft/agents-activity";
import {
  AgentApplicationBuilder,
  MessageFactory,
  TurnContext,
} from "@microsoft/agents-hosting";
import { dateTool, nowTool } from "./tools/dateTimeTool";
import { getWeatherTool } from "./tools/getWeatherTool";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { readFileSync } from "fs";
import { resolve } from "path";
import { storeChart } from "./chartStore";

interface WeatherForecastAgentResponse {
  contentType: "Text" | "AdaptiveCard" | "Image";
  content: string;
}

export const weatherAgent = new AgentApplicationBuilder().build();

weatherAgent.onConversationUpdate(
  "membersAdded",
  async (context: TurnContext) => {
    await context.sendActivity(
      `Hello and Welcome! I'm here to help with all your weather forecast needs!`,
    );
  },
);

const client = new MultiServerMCPClient({
  mcpServers: {
    proto: {
      transport: "http",
      url: "https://1847-4-213-232-135.ngrok-free.app/mcp",
    },
  },
});

const agentModel = new AzureChatOpenAI({
  azureOpenAIApiVersion: "2024-12-01-preview",
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  temperature: 0,
});
const agentCheckpointer = new MemorySaver();

const systemPrompt = readFileSync(
  resolve(__dirname, "prompts", "systemPrompt.md"),
  "utf-8",
);

const main = async () => {
  const agentTools = [
    getWeatherTool,
    dateTool,
    nowTool,
    ...(await client.getTools()),
  ];
  const agent = createAgent({
    model: agentModel,
    tools: agentTools,
    checkpointer: agentCheckpointer,
    systemPrompt,
  });

  weatherAgent.onActivity(ActivityTypes.Message, async (context, state) => {
    const threadId = context.activity.conversation!.id;
    const userMessage = context.activity.text!;
    console.log(`[${threadId}] User: ${userMessage}`);

    const startTime = Date.now();
    const llmResponse = await agent.invoke(
      { messages: [new HumanMessage(userMessage)] } as any,
      { configurable: { thread_id: threadId } },
    );
    const duration = Date.now() - startTime;

    const toolMessages = llmResponse.messages.filter(
      (m: any) => m._getType?.() === "tool",
    );
    if (toolMessages.length > 0) {
      const toolNames = toolMessages.map((m: any) => m.name).join(", ");
      console.log(`[${threadId}] Tools called: ${toolNames}`);
    }

    const lastMessage = llmResponse.messages[llmResponse.messages.length - 1];
    const llmResponseContent: WeatherForecastAgentResponse = JSON.parse(
      lastMessage.content as string,
    );
    console.log(
      `[${threadId}] Response: ${llmResponseContent.contentType} (${duration}ms)`,
    );

    if (llmResponseContent.contentType === "Text") {
      await context.sendActivity(llmResponseContent.content);
    } else if (llmResponseContent.contentType === "AdaptiveCard") {
      const response = MessageFactory.attachment({
        contentType: "application/vnd.microsoft.card.adaptive",
        content: llmResponseContent.content,
      });
      await context.sendActivity(response);
    } else if (llmResponseContent.contentType === "Image") {
      // Extract image and Plotly schema from tool messages.
      // The LLM can't reproduce large base64 strings, so we pull
      // image data and chart schema directly from tool results.
      let imageUrl = "";
      let plotlySchema: any = null;

      for (const msg of toolMessages) {
        const content = (msg as any).content;
        if (Array.isArray(content)) {
          const imageBlock = content.find(
            (block: any) => block.type === "image_url",
          );
          if (imageBlock) {
            imageUrl = imageBlock.image_url?.url ?? "";
          }
        }
        const artifact = (msg as any).artifact;
        if (Array.isArray(artifact)) {
          const meta = artifact.find(
            (a: any) => a.type === "mcp_meta" && a.data?.plotlySchema,
          );
          if (meta) {
            plotlySchema = meta.data.plotlySchema;
          }
        }
        if (imageUrl && plotlySchema) break;
      }

      // Build the Adaptive Card body
      const cardBody: any[] = [];
      if (imageUrl) {
        cardBody.push({ type: "Image", url: imageUrl, size: "stretch" });
      }

      // If we have a Plotly schema, store it and add a task module button
      const cardActions: any[] = [];
      if (plotlySchema) {
        const chartId = storeChart(plotlySchema);
        const botDomain = process.env.BOT_DOMAIN ?? "";
        const appId = process.env.TEAMS_APP_ID ?? "";
        const chartUrl = `https://${botDomain}/chart.html?id=${chartId}`;
        const taskModuleUrl =
          `https://teams.microsoft.com/l/task/${appId}` +
          `?url=${encodeURIComponent(chartUrl)}` +
          `&height=large&width=large` +
          `&title=${encodeURIComponent("Interactive Chart")}`;
        cardActions.push({
          type: "Action.OpenUrl",
          title: "View Interactive Chart",
          url: taskModuleUrl,
        });
      }

      if (cardBody.length > 0 || cardActions.length > 0) {
        const response = MessageFactory.attachment({
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: cardBody,
            actions: cardActions,
          },
        });
        await context.sendActivity(response);
      }
    }
  });
};

main();
