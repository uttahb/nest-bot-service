import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { OpenAI } from 'openai'; // Import OpenAI class
import { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { PrismaService } from '../prisma/prisma.service';

import { Client } from '@elastic/elasticsearch';
import { chats } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as langdetect from 'langdetect';

interface HistoryItem {
  content: string; // The text content of the chat
  timestamp?: Date; // Optional timestamp for when the message was created
}

export interface ChatHistory {
  query: string;
  response: string;
  order: number;
  created_at: Date;
}

interface DocumentSource {
  title?: string;
  content?: string; // Ensure this matches your actual field
  content_vector: number[];
}

@Injectable()
export class ChatBotService {
  private franc: any;
  private openai: OpenAI;
  private client: Client;
  private readonly indexName = process.env.ELASTICSEARCH_INDEX || 'vector-index'; // Fallback to 'vector-index' if the env var is not set

  constructor(
    private readonly prisma: PrismaService,
    private configService: ConfigService
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.client = new Client({
      node: this.configService.get('ELASTIC_URL'),
      auth: {
        username: this.configService.get('ELASTICSEARCH_USERNAME'),
        password: this.configService.get('ELASTICSEARCH_PASSWORD'),
      }
    });
  }

  async chat(
    query: string,
    history: HistoryItem[],
  ): Promise<{ response: string }> {
    try {
      const queryVector = await this.generateQueryVector(query);

      if (!queryVector.length) {
        return { response: 'Failed to generate query vector.' };
      }

      const context = await this.fetchRelevantContext(queryVector, query);

      if (!context.length) {
        console.log('No relevant documents found in Elasticsearch.');
        return { response: 'No relevant documents found for your query.' };
      }

      //console.log('Elasticsearch Results Before Sending to OpenAI:', context);
      const combinedContext = this.combineContext(history, context);

      const prompt = `Relevant context from your documents:\n${combinedContext}\nUser: ${query}\nAI:`;

      const openAIResponse = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Only respond based on the context provided from the user\'s indexed documents.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      });

      //console.log('openAIResponse:', openAIResponse);
      const response = openAIResponse.choices[0]?.message?.content || 'No response generated.';
      return { response };
    } catch (error) {
      console.error('Error in chat service:', error);
      throw new Error('Failed to process the chat request.');
    }
  }

  private async generateQueryVector(query: string): Promise<number[]> {
    try {
      const embedding = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query,
      });
      const queryVector = embedding.data[0]?.embedding;
      if (!queryVector || queryVector.length === 0) {
        throw new Error('Embedding generation failed.');
      }
      return queryVector;
    } catch (error) {
      console.error('Error generating query vector:', error.message);
      return [];
    }
  }

  async fetchRelevantContext(vector: number[], query: string): Promise<string[]> {
    try {
      const language = await this.detectLanguage(query);
      console.log('Detected Language:', language);

      const languageAnalyzer = language === 'ar' ? 'arabic' : 'standard';

      const searchBody = {
        query: {
          bool: {
            must: [
              { match: { title: { query, analyzer: languageAnalyzer } } },
              { exists: { field: 'content_vector' } }
            ],
          },
        },
        knn: {
          field: 'content_vector',
          query_vector: vector,
          k: 5,
          num_candidates: 50,
        },
        size: 10,
      };

      //console.log('Elasticsearch Query:', JSON.stringify(searchBody, null, 2));

      const response: SearchResponse<DocumentSource> = await this.client.search({
        index: this.indexName,
        body: searchBody,
      });

      const hits = response.hits.hits;

      if (hits.length === 0) {
        console.warn('No relevant documents found.');
        return ['No relevant context available.'];
      }

      // Assuming you want to return the documents with their language-specific query structure:
      return hits.map(hit => {
        if (language === 'ar') {
          // Construct Arabic-specific response, could be more complex based on your needs
          return `استعلام: ${hit._source.content}`;
        } else {
          // Construct query in other formats if needed
          return `Query: ${hit._source.content}`;
        }
      });

    } catch (error) {
      console.error('Error fetching relevant context:', error.message);
      throw new Error('Elasticsearch query failed.');
    }
  }

  private combineContext(history: HistoryItem[], context: string[]): string {
    const historyContext = history.map((h) => `User: ${h.content}`).join('\n');
    const documentContext = context.map((doc) => `Context: ${doc}`).join('\n');
    return [documentContext, historyContext].join('\n');
  }

  async createChatHistory({
    chatId,
    query,
    response,
    order,
  }: {
    chatId: string;
    query: string;
    response: string;
    order: number;
  }): Promise<void> {
    await this.prisma.chat_history.create({
      data: {
        chat_id: chatId,
        query,
        response,
        order,
      },
    });
  }

  async getChatHistoryByChatId(chatId: string): Promise<HistoryItem[]> {
    const chatHistory = await this.prisma.chat_history.findMany({
      where: { chat_id: chatId },
      orderBy: { order: 'asc' }, // Ensure chronological order
    });

    return chatHistory.map((item) => ({
      content: item.response,
      timestamp: item.created_at,
    }));
  }

  async createChat(userId: string, title: string): Promise<chats> {
    return this.prisma.chats.create({
      data: {
        user_id: userId,
        title: title, // Placeholder title
      },
    });
  }

  /**
   * Get a specific chat by its ID and user ID.
   * @param chatId - UUID of the chat.
   * @param userId - ID of the user to ensure ownership.
   * @returns A single chat object or null if not found.
   */
  async getChatById(chatId: string, userId: string): Promise<chats | null> {
    try {
      const chat = await this.prisma.chats.findFirst({
        where: { uuid: chatId, user_id: userId },
      });

      if (!chat) {
        throw new NotFoundException(`Chat with ID ${chatId} not found for the given user.`);
      }

      return chat;
    } catch (error) {
      console.error(`Error fetching chat by ID: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve chat. Please try again.');
    }
  }

  /**
   * List all chats for a specific user, sorted by creation date in descending order.
   * @param userId - ID of the user to list chats for.
   * @returns An array of chat summaries.
   */
  async listChats(userId: string): Promise<chats[]> {
    try {
      return await this.prisma.chats.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: {
          uuid: true,
          user_id: true,
          title: true,
          created_at: true,
        },
      });
    } catch (error) {
      console.error(`Error listing chats for user ID ${userId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve chats. Please try again.');
    }
  }

  /**
   * Get the history of a specific chat by its ID.
   * @param chatId - UUID of the chat to retrieve history for.
   * @returns An array of chat history records.
   */
  async getChatHistory(chatId: string): Promise<ChatHistory[]> {
    try {
      const history = await this.prisma.chat_history.findMany({
        where: { chat_id: chatId },
        orderBy: { order: 'asc' },
        select: {
          query: true,
          response: true,
          order: true,
          created_at: true,
        },
      });

      if (!history.length) {
        throw new NotFoundException(`No history found for chat ID ${chatId}.`);
      }

      return history;
    } catch (error) {
      console.error(`Error fetching chat history for chat ID ${chatId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve chat history. Please try again.');
    }
  }

  async detectLanguage(query: string): Promise<string> {
    try {
      // Assuming `langdetect` provides a detect function
      const detectedLanguages = langdetect.detect(query); // Returns an array of languages
      //console.log('Detected Languages:', detectedLanguages);

      // Return the most probable language or fallback
      return detectedLanguages && detectedLanguages.length > 0
        ? detectedLanguages[0].lang
        : 'Unable to detect language';
    } catch (error) {
      console.error('Error loading langCode:', error);
      return 'Error detecting language';
    }
  }

}