// src/queue/queue.processor.ts
// import { Processor } from '@nestjs/bullmq';
// import { ConfigService } from '@nestjs/config';
// import { Job } from 'bullmq';
// import * as fs from 'fs';
// import * as path from 'path';

// @Processor('vectorizer-queue')
// export class Vectorizer {
//   constructor(private readonly config: ConfigService) {}
//   @Process('vectorizer-queue')
//   async handleVectorizer(job: Job) {
//     const timestamp = job.data.timestamp;
//     console.log(`Processing job with timestamp: ${timestamp}`);
//     const directoryPath = this.config.get('STORAGE_DIR');

//     await this.traverseDirectory(directoryPath);
//   }

//   private async traverseDirectory(directoryPath: string) {
//     console.log(directoryPath);
//     // const files = fs.readdirSync(directoryPath);

//     // for (const file of files) {
//     //   const filePath = path.join(directoryPath, file);
//     //   const stat = fs.statSync(filePath);

//     //   if (stat.isDirectory()) {
//     //     await this.traverseDirectory(filePath);
//     //   } else if (stat.isFile()) {
//     //     console.log(`Reading file: ${filePath}`);
//     //     const content = fs.readFileSync(filePath, 'utf-8');
//     //     console.log(content);
//     //   }
//     // }
//   }
// }
import { QdrantClient } from '@qdrant/js-client-rest';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { DocxLoader } from 'langchain/document_loaders/fs/docx';
import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';

@Processor('vectorizer-queue')
export class Vectorizer extends WorkerHost {
  constructor(private config: ConfigService) {
    super();
  }
  async process(job: Job<any, any, string>): Promise<any> {
    const client = new QdrantClient({ host: 'localhost', port: 6333 });
    client.deleteCollection('wholekh');

    console.log('Processing job:', job.data);
    const dir = this.config.get('STORAGE_DIR');
    const loader = new DirectoryLoader(dir, {
      '.pdf': (path: string) => new PDFLoader(path),
      '.docx': (path: string) => new DocxLoader(path),
    });
    const docs = await loader.load();
    // console.log(docs);
    console.log('qdrant url ', this.config.get('QDRANT_URL'));
    try {
      await QdrantVectorStore.fromDocuments(docs, new OpenAIEmbeddings(), {
        url: this.config.get('QDRANT_URL'),
        collectionName: 'wholekh',
      });
      console.log('vectorizer done');
    } catch (err) {
      console.log(err);
    }

    // let progress = 0;
    // for (i = 0; i < 100; i++) {
    //   await doSomething(job.data);
    //   progress += 1;
    //   await job.progress(progress);
    // }
    // return {};
  }
}
