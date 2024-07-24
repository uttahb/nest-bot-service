import { Injectable } from '@nestjs/common';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { Express } from 'express';

import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { DocxLoader } from 'langchain/document_loaders/fs/docx';

import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class UploadService {
  constructor(private config: ConfigService) {}
  async handleFileUpload(file: Express.Multer.File, dirName: string) {
    const filePath = this.saveFile(file, dirName);
    const uploadPath = join(__dirname, '..', `uploads/`);
    const loader = new DirectoryLoader(uploadPath, {
      '.pdf': (path: string) => new PDFLoader(path),
      '.docx': (path: string) => new DocxLoader(path),
    });
    const docs = await loader.load();
    const vectorStore = await QdrantVectorStore.fromDocuments(
      docs,
      new OpenAIEmbeddings(),
      {
        url: this.config.get('QDRANT_URL'),
        collectionName: dirName,
      },
    );
    const response = await vectorStore.similaritySearch(
      'when is abdul kalam born?',
      1,
    );

    console.log(response);

    return { message: 'File uploaded successfully', filePath };
  }

  private saveFile(file: Express.Multer.File, dirName: string): string {
    const uploadPath = join(__dirname, '..', `uploads/${dirName}`);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    const filePath = join(uploadPath, file.originalname);
    writeFileSync(filePath, file.buffer);
    return filePath;
  }
}
