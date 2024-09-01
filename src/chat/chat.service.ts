import { Injectable } from '@nestjs/common';
import { OpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { QdrantVectorStore } from '@langchain/qdrant';
import { ConversationalRetrievalQAChain } from 'langchain/chains';

interface HistoryItem {
  role: string;
  content: string;
}

@Injectable()
export class ChatService {
  private newOpenAiEmbeddings: OpenAIEmbeddings;
  private chain: ConversationalRetrievalQAChain;
  constructor(private readonly config: ConfigService) {
    this.newOpenAiEmbeddings = new OpenAIEmbeddings({
      verbose: true,
      openAIApiKey: this.config.get('OPENAI_API_KEY'),
    });
  }
  async query(
    userId: string,
    query: string,
    history: HistoryItem[],
  ): Promise<any> {
    console.log(userId);
    console.log(query);
    console.log(history);
    history = history || [];
    const vectorStore = new QdrantVectorStore(this.newOpenAiEmbeddings, {
      url: this.config.get('QDRANT_URL'),
      collectionName: userId,
    });
    const model = new OpenAI({});
    this.chain = ConversationalRetrievalQAChain.fromLLM(
      model,
      vectorStore.asRetriever(),
      {
        returnSourceDocuments: true,
      },
    );
    // const defaultPrompt = `\n\n can you please explain as bulletin points and a summary at the end format?`;
    const res = await this.chain.call({
      question: query,
      chat_history: history.map((h) => h.content).join('\n'),
    });
    console.log(res);
    return res;
  }

  async queryAll(
    userId: string,
    query: string,
    history: HistoryItem[],
  ): Promise<any> {
    console.log(userId);
    console.log(query);
    console.log(history);
    history = history || [];
    const vectorStore = new QdrantVectorStore(this.newOpenAiEmbeddings, {
      url: this.config.get('QDRANT_URL'),
      collectionName: 'wholekh',
    });
    const model = new OpenAI({});
    this.chain = ConversationalRetrievalQAChain.fromLLM(
      model,
      vectorStore.asRetriever(),
      {
        returnSourceDocuments: true,
      },
    );
    // const defaultPrompt = `\n\n can you please explain as bulletin points and a summary at the end format?`;
    const res = await this.chain.call({
      question: query,
      chat_history: history.map((h) => h.content).join('\n'),
    });
    console.log(res);
    return res;
  }
}
