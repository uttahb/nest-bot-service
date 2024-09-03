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
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import * as fs from 'fs';
import * as path from 'path';

@Processor('vectorizer-queue')
export class Vectorizer extends WorkerHost {
  constructor(private config: ConfigService) {
    super();
  }
  async process(job: Job<any, any, string>): Promise<any> {
    const client = new QdrantClient({
      host: this.config.get('VECTORDB_HOST'),
      port: 6333,
    });
    try {
      await client.deleteCollection('wholekh');
    } catch (err) {
      console.log(err);
    }
    try {
      console.log('Processing job:', job.data);
      const dir = this.config.get('STORAGE_DIR');
      await this.loopThroughChildDirectories(dir);
    } catch (err) {
      console.log(err);
    }

    // try {

    // } catch (err) {
    //   console.log(err);
    // }

    // let progress = 0;
    // for (i = 0; i < 100; i++) {
    //   await doSomething(job.data);
    //   progress += 1;
    //   await job.progress(progress);
    // }
    // return {};
  }
  async vectorizeDirectory(directoryPath: string) {
    const loader = new DirectoryLoader(directoryPath, {
      '.pdf': (path) => new PDFLoader(path),
      '.docx': (path) => new DocxLoader(path),
      '.csv': (path) => new CSVLoader(path),
    });
    const docs = await loader.load();
    const vectorStore = await QdrantVectorStore.fromDocuments(
      docs,
      new OpenAIEmbeddings(),
      {
        client: new QdrantClient({
          host: this.config.get('VECTORDB_HOST'),
          port: 6333,
        }),
        collectionName: 'wholekh',
      },
    );
    return vectorStore;
  }
  async loopThroughChildDirectories(directoryPath: string): Promise<void> {
    // Read the contents of the directory
    const stream = fs.createWriteStream('error_docs.txt', { flags: 'a' });

    fs.readdir(directoryPath, async (err, files) => {
      if (err) {
        console.error(`Error reading directory: ${err.message}`);
        return;
      }

      // files.forEach((file) => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Get the full path of the file/directory
        const fullPath = path.join(directoryPath, file);

        // Get the stats for the file/directory
        const statsObj = fs.statSync(fullPath);
        if (statsObj.isDirectory()) {
          try {
            await this.vectorizeDirectory(fullPath);
          } catch (err) {
            console.log(err);
            stream.write(fullPath + '\n');
          }
        }
      }
      stream.end();
    });
  }
}
