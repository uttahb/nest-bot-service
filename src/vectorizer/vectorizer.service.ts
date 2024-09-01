import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class VectorizerService {
  constructor(@InjectQueue('vectorizer-queue') private indexQueue: Queue) {}

  async reIndex() {
    const job = await this.indexQueue.add('index', { timestamp: Date.now() });
    return job;
  }
}
