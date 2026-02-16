import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent } from "langchain";
import { AzureChatOpenAI } from "@langchain/openai";
import { ActivityTypes } from "@microsoft/agents-activity";
import {
  AgentApplicationBuilder,
  MessageFactory,
  TurnContext,
} from "@microsoft/agents-hosting";
import { dateTool } from "./tools/dateTimeTool";
import { getWeatherTool } from "./tools/getWeatherTool";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

interface WeatherForecastAgentResponse {
  contentType: "Text" | "AdaptiveCard";
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
      url: "https://1bb8b5345c53.ngrok-free.app/mcp",
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

const sysMessage = new SystemMessage(`
You are a friendly assistant that helps people find a weather forecast for a given time and place.
You may ask follow up questions until you have enough information to answer the customers question,
but once you have a forecast forecast, make sure to format it nicely using an adaptive card.

Respond in JSON format with the following JSON schema, and do not use markdown in the response:

{
    "contentType": "'Text' or 'AdaptiveCard' only",
    "content": "{The content of the response, may be plain text, or JSON based adaptive card}"
}`);

const main = async () => {
  const agentTools = [getWeatherTool, dateTool, ...(await client.getTools())];
  const agent = createAgent({
    model: agentModel,
    tools: agentTools,
    checkpointer: agentCheckpointer,
  });

  weatherAgent.onActivity(ActivityTypes.Message, async (context, state) => {
    const llmResponse = await agent.invoke(
      {
        messages: [sysMessage, new HumanMessage(context.activity.text!)],
      } as any,
      {
        configurable: { thread_id: context.activity.conversation!.id },
      },
    );

    // console.log(llmResponse.messages);

    const llmResponseContent: WeatherForecastAgentResponse = JSON.parse(
      llmResponse.messages[llmResponse.messages.length - 1].content as string,
    );

    if (llmResponseContent.contentType === "Text") {
      await context.sendActivity(llmResponseContent.content);
    } else if (llmResponseContent.contentType === "AdaptiveCard") {
      const response = MessageFactory.attachment({
        contentType: "application/vnd.microsoft.card.adaptive",
        content: llmResponseContent.content,
      });
      await context.sendActivity(response);
    }
  });
};

main();
