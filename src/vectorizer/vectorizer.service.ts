import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VectorizerService {
  private dbType: string;

  constructor(
    @InjectQueue('vectorizer-queue') private indexQueue: Queue,
    private configService: ConfigService,
  ) {
    this.dbType = this.configService.get<string>('DB_TYPE');
  }

  async reIndex() {
    switch (this.dbType) {
      case 'qdrant':
        return this.reIndexQdrant();
      case 'elasticsearch':
      default:
        throw new Error(`Unsupported DB_TYPE: ${this.dbType}`);
    }
  }

  private async reIndexQdrant() {
    try {
      const job = await this.indexQueue.add('index', { timestamp: Date.now() });
      console.log('Qdrant reindexing complete.');
      return job;
    } catch (error) {
      console.error('Error during Qdrant reindexing:', error);
      throw error;
    }
  }
}
