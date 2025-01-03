import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { OpenAIEmbeddings } from '@langchain/openai';

@Processor('vectorizer-queue')
export class Vectorizer extends WorkerHost {
  private elasticsearchClient: Client;

  constructor(private config: ConfigService) {
    super();
    const elasticsearchHost = this.config.get<string>('ELASTICSEARCH_HOST');
    if (!elasticsearchHost) {
      throw new Error('ELASTICSEARCH_HOST is not defined in the environment variables');
    }
    this.elasticsearchClient = new Client({
      node: elasticsearchHost,
      requestTimeout: 300000, // Increase timeout (in ms)
    });
  }

  async process(job: Job<any, any, string>): Promise<any> {
    try {
      //console.log(`Processing job with DB_TYPE: elasticsearch`);
      await this.processElasticsearch(job);
    } catch (error) {
      console.error('Error processing Elasticsearch job:', error);
      throw error;
    }
  }

  private async processElasticsearch(job: Job<any, any, string>) {
    const documents = job.data.documents;
    const bulkBody = [];

    for (const doc of documents) {
      const chunks = this.splitTextIntoChunks(doc.content, 500);
      const embeddings = await Promise.all(chunks.map(chunk => new OpenAIEmbeddings().embedDocuments([chunk])));

      embeddings.forEach((embedding, index) => {
        bulkBody.push(
          { index: { _index: 'your-index-name' } },
          {
            title: `${doc.title} (Part ${index + 1})`,
            content: chunks[index],
            vector: embedding[0],
          }
        );
      });
    }

    if (bulkBody.length > 0) {
      await this.elasticsearchClient.bulk({ body: bulkBody });
      //console.log(`Successfully indexed ${bulkBody.length / 2} documents.`);
    }
  }

  private splitTextIntoChunks(text: string, maxTokens: number = 500): string[] {
    const words = text.split(/\s+/);
    const chunks = [];
    let currentChunk: string[] = [];

    for (const word of words) {
      currentChunk.push(word);
      if (currentChunk.join(' ').length >= maxTokens) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
      }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));
    return chunks;
  }
}
