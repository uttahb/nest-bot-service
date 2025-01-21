import { Injectable, Logger } from '@nestjs/common';
import { OpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { QdrantVectorStore } from '@langchain/qdrant';
import { ConversationalRetrievalQAChain } from 'langchain/chains';

interface HistoryItem {
  content: string; // The text content of the chat
  timestamp?: Date; // Optional timestamp for when the message was created
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private newOpenAiEmbeddings: OpenAIEmbeddings;
  private chain: ConversationalRetrievalQAChain;
  private seenQueries = new Map<string, number>();

  // Define a timeout period in milliseconds (e.g., 30 seconds)
  private readonly QUERY_TIMEOUT = 30 * 1000;

  constructor(
    private readonly configService: ConfigService,  // Assuming you're using ConfigService
  ) {
    this.newOpenAiEmbeddings = new OpenAIEmbeddings({
      verbose: true,
      openAIApiKey: this.configService.get('OPENAI_API_KEY'),
    });

  }

  // Main query method
  async query(
    userId: string,
    query: string,
    history: HistoryItem[],
  ): Promise<any> {
    //this.logger.log(`Processing individual query for user: ${userId}`);

    try {
      if (!query) throw new Error('Query string is empty');
      if (!userId) throw new Error('User ID is missing');

      const currentTime = Date.now();

      // Prevent circular queries by checking the timestamp in the seenQueries map
      if (this.seenQueries.has(query)) {
        const lastProcessedTime = this.seenQueries.get(query);
        if (currentTime - lastProcessedTime < this.QUERY_TIMEOUT) {
          throw new Error(`Circular query detected: ${query}`);
        }
      }

      // Add the current query with the timestamp to seenQueries
      this.seenQueries.set(query, currentTime);

      history = history || [];
      let vectorStore: any;

      // Determine database type
      const dbType = this.configService.get('VECTOR_DB_TYPE');
      if (dbType === 'qdrant') {
        vectorStore = new QdrantVectorStore(this.newOpenAiEmbeddings, {
          url: this.configService.get('QDRANT_URL'),
          collectionName: userId,
        });
      } else {
        throw new Error('Unsupported VECTOR_DB_TYPE');
      }

      // Conversational Chain
      const model = new OpenAI({});
      this.chain = ConversationalRetrievalQAChain.fromLLM(
        model,
        vectorStore.asRetriever(),
        { returnSourceDocuments: true },
      );

      const response = await this.chain.call({
        question: query,
        chat_history: history.map((h) => h.content).join('\n'),
      });

      this.seenQueries.delete(query);

      return response;
    } catch (error) {
      this.logger.error(`Error in query: ${error.message}`, error.stack);
      throw new Error(`Failed to process the query: ${error.message}`);
    }
  }

  async queryAll(
    userId: string,
    query: string,
    history: HistoryItem[],
  ): Promise<any> {
    //this.logger.log(Processing queryAll with query: ${query});

    try {
      if (!query) throw new Error('Query string is empty');

      const currentTime = Date.now();

      history = history || [];
      let retriever: any;

      // Prevent circular queries by checking the timestamp in the seenQueries map
      if (this.seenQueries.has(query)) {
        const lastProcessedTime = this.seenQueries.get(query);
        if (currentTime - lastProcessedTime < this.QUERY_TIMEOUT) {
          throw new Error(`Circular query detected: ${query}`);
        }
      }

      // Add the current query with the timestamp to seenQueries
      this.seenQueries.set(query, currentTime);

      const dbType = this.configService.get('VECTOR_DB_TYPE');
      if (dbType === 'qdrant') {
        retriever = new QdrantVectorStore(this.newOpenAiEmbeddings, {
          url: this.configService.get('QDRANT_URL'),
          collectionName: 'global',
        }).asRetriever();
      } else {
        throw new Error('Unsupported VECTOR_DB_TYPE');
      }

      const model = new OpenAI({});
      this.chain = ConversationalRetrievalQAChain.fromLLM(
        model,
        retriever,
        { returnSourceDocuments: true },
      );

      const truncatedHistory = history
        .slice(-5) // Limit history to last 5 entries
        .map((h) => h.content)
        .join('\n');

      const response = await this.chain.call({
        question: query,
        chat_history: truncatedHistory,
      });

      this.seenQueries.delete(query);
      return response;
    } catch (error) {
      this.logger.error(`Error in queryAll: ${error.message}`, error.stack);
      throw new Error(`Failed to process queryAll: ${error.message}`);
    }
  }

}
