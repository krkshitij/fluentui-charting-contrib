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
      // The LLM cannot reproduce large base64 strings, so extract
      // the actual image data URI from tool message content blocks.
      let imageUrl = "";
      for (const msg of toolMessages) {
        const content = (msg as any).content;
        if (Array.isArray(content)) {
          const imageBlock = content.find(
            (block: any) => block.type === "image_url",
          );
          if (imageBlock) {
            imageUrl = imageBlock.image_url?.url ?? "";
            break;
          }
        }
      }

      if (imageUrl) {
        const response = MessageFactory.attachment({
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "Image",
                url: imageUrl,
                size: "stretch",
              },
            ],
          },
        });
        await context.sendActivity(response);
      }
    }
  });
};

main();
