import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';

import * as fs from 'fs';
import * as path from 'path';
import * as pdf from 'pdf-parse';
import * as xlsx from 'xlsx';
import * as mammoth from 'mammoth'; // For extracting text from .docx files
import * as Tesseract from 'tesseract.js';
import * as langdetect from 'langdetect';

interface ElasticsearchDocument {
  version_id: any;
  title: string;
  content?: string;
  analyzer: string;
  content_vector: number[];
}

@Injectable()
export class ElasticvectordbService {
  private client: Client;
  private storageDir: string;
  private readonly indexName = process.env.ELASTICSEARCH_INDEX || 'vector-index'; // Fallback to 'vector-index' if the env var is not setprivate readonly logger = new Logger(PdfService.name);private readonly logger = new Logger(PdfService.name);
  private readonly logger = new Logger(ElasticvectordbService.name);

  constructor(
    private configService: ConfigService,
  ) {
    this.client = new Client({
      node: this.configService.get('ELASTIC_URL'),
      auth: {
        username: this.configService.get('ELASTICSEARCH_USERNAME'),
        password: this.configService.get('ELASTICSEARCH_PASSWORD'),
      }
    });
    this.storageDir = path.normalize(this.configService.get<string>('STORAGE_DIR'));
  }

  // Vectorize the document by generating embeddings
  async vectorizeDocument(doc: { document_id: string; title: string; content: string; version_id: any }) {
    const chunkSize = 1000; // Character limit
    const chunks = splitTextIntoChunks(doc.content, chunkSize);

    const embeddingPromises = chunks.map(async (chunk, index) => {
      // Validate chunk content
      if (!chunk || typeof chunk !== "string" || chunk.trim().length === 0) {
        console.warn(`Skipping empty or invalid chunk at index ${index}`);
        return;
      }

      try {
        // Generate embeddings
        const embeddings = await new OpenAIEmbeddings().embedDocuments([chunk]);
        if (!embeddings || !Array.isArray(embeddings[0])) {
          throw new Error(`Invalid embedding format for chunk ${index + 1}`);
        }

        const language = await this.detectLanguage(chunk);
        const analyzer = language === 'ar' ? 'arabic' : 'standard';

        // Index document with embedding
        await this.indexDocument(this.indexName, doc.document_id, {
          version_id: `${doc.version_id}`,
          title: `${doc.title} (Part ${index + 1})`,
          content: chunk,
          analyzer: analyzer,
          content_vector: embeddings[0],
        });
      } catch (error) {
        console.error(`Failed to process chunk ${index + 1}:`, error.message);
      }
    });

    await Promise.all(embeddingPromises);
    return `Processed ${chunks.length} chunks for document ${doc.title}`;
  }

  // Load documents from the provided paths (doc_id -> doc_path)
  async loadDocumentsFromPaths(docPaths: { [key: string]: string }) {
    //console.log("docPaths---", docPaths);
    const documents = [];
    for (const [documentId, relativePath] of Object.entries(docPaths)) {
      console.log("relativePath---", relativePath);
      const normalizedPath = path.normalize(relativePath);
      console.log("normalizedPath---", normalizedPath);
      const document = await this.extractDocFromthePath(documentId, normalizedPath);
      if (document) documents.push(document);
    }

    return documents;
  }

  // Extract document based on documentId and its relative path
  async extractDocFromthePath(documentId: string, relativePath: string) {
    console.log("documentId", documentId);

    // Extract versionId from the relative path
    const versionId = extractVersionId(relativePath);

    // Check if versionId exists, otherwise return empty response
    if (versionId) {
      // Normalize the relative path to use Unix-style separators
      const normalizedRelativePath = relativePath.replace(/\\/g, '/');

      // Resolve the base storage directory and normalize it for the environment
      const basePath = process.env.STORAGE_DIR || '/app/documents';
      const normalizedBasePath = path.normalize(basePath).replace(/\\/g, '/');

      // Join the base path and normalized relative path
      const fullPath = path.posix.join(normalizedBasePath, documentId.toString(), normalizedRelativePath);

      console.log("Final document path:", fullPath);
      console.log(`Attempting to resolve file: StorageDir: ${normalizedBasePath}, DocumentId: ${documentId}, RelativePath: ${relativePath}`);

      // Check if the file exists at the resolved path
      if (fs.existsSync(fullPath)) {
        try {
          let text = '';

          // Determine file type and process accordingly
          if (fullPath.endsWith('.pdf')) {
            text = await this.extractTextFromPdf(fullPath);
          } else if (fullPath.endsWith('.txt')) {
            text = fs.readFileSync(fullPath, 'utf-8');
            console.log("Doc type: txt", documentId);
          } else if (fullPath.endsWith('.xlsx')) {
            console.log("Doc type: xlsx", documentId);
            text = this.extractTextFromExcel(fullPath);
          } else if (fullPath.endsWith('.docx')) {
            console.log("Doc type: docx", documentId);
            text = await this.extractTextFromDocx(fullPath);
          } else if (this.isImage(fullPath)) {
            console.log("Doc type: image", documentId);
            text = await this.extractTextFromImage(fullPath);
          } else {
            return {
              document_id: documentId,
              title: '',
              content: '',
              version_id: versionId,
              reason: "The uploaded file format is not supported",
            };
          }

          // If text was successfully extracted, return the document details
          if (text) {
            return {
              document_id: documentId,
              title: `${documentId}_${relativePath}`, // Use relative path for title
              content: text,
              version_id: versionId,
            };
          }
        } catch (error) {
          console.error(`Error processing file ${fullPath} in document ${documentId}`, error);
          return {
            document_id: documentId,
            title: '',
            content: '',
            version_id: versionId,
          };
        }
      } else {
        throw new Error(`File not found: ${fullPath}`);
      }
    } else {
      return {
        document_id: documentId,
        title: '',
        content: '',
        version_id: '',
      };
    }
  }

  async extractTextFromPdf(filePath: string): Promise<string> {
    try {
      const normalizedPath = path.normalize(filePath);

      if (!fs.existsSync(normalizedPath)) {
        throw new Error(`File not found: ${normalizedPath}`);
      }

      const fileBuffer = fs.readFileSync(normalizedPath);
      const data = await pdf(fileBuffer);

      if (!data.text || data.text.trim() === '') {
        console.warn('No text could be extracted, file may use unsupported fonts or be empty.');
        return 'Unable to extract text.';
      }

      return data.text;
    } catch (error) {
      console.error(`Error extracting text from ${filePath}:`, error.message);
      if (error.message.includes('TT: undefined function')) {
        console.warn('Font issue detected; consider using OCR or preprocessing the PDF.');
      }
      throw error;
    }
  }

  private extractTextFromExcel(filePath: string): string {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheets = workbook.SheetNames;
      let text = '';

      for (const sheetName of sheets) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 }); // Converts to a 2D array

        // Filter rows with at least one non-empty cell
        const filteredData = jsonData.filter(row =>
          row.some(cell => cell !== null && cell !== undefined && cell !== '')
        );

        if (filteredData.length > 0) {
          filteredData.forEach(row => {
            const rowData = row
              .filter(cell => cell !== null && cell !== undefined && cell !== '') // Remove empty cells
              .join(','); // Combine cells into a CSV-like string
            if (rowData) text += rowData + '\n'; // Add to text with a newline
          });
        }
      }

      return text; // Final processed text
    } catch (error) {
      console.error(`Failed to extract text from Excel file ${filePath}:`, error.message);
      throw error;
    }
  }

  private async extractTextFromDocx(filePath: string): Promise<string> {
    try {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error(`Failed to extract text from Word document ${filePath}:`, error.message);
      throw error;
    }
  }

  async extractTextFromImage(imagePath: string): Promise<string> {
    try {
      // Start recognizing text from the image using tesseract.js
      const { data } = await Tesseract.recognize(
        imagePath,       // Path to the image file
        'eng',           // Language, you can modify as needed
        {
          // logger: (m) => console.log(m), // Log progress if needed
        }
      );

      // Return the extracted text
      return data.text;
    } catch (error) {
      console.error('Error extracting text from image:', error.message);
      throw new Error('Text extraction failed');
    }
  }

  private isImage(fileName: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'];
    return imageExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // Index a document into Elasticsearch
  async indexDocument(index: string, docID, document: ElasticsearchDocument) {
    try {
      const response = await this.client.index({
        index,
        id: docID,
        body: document,  // The body now contains content_vector, not vector
      });
      return response;
    } catch (error) {
      console.error('Error indexing document:', error.message, error.stack);
      throw new Error('Failed to index document');
    }
  }

  // Delete a document by ID
  async deleteDocument(docId: string): Promise<{ success: boolean; result?: string }> {
    try {

      const exists = await this.client.exists({
        index: this.indexName,
        id: docId,
      });

      if (exists) {
        const response = await this.client.delete({
          index: this.indexName,
          id: docId,
        });

        if (response.result === 'deleted') {
          return { success: true, result: response.result };
        } else {
          return { success: false, result: response.result };
        }
      } else {
        console.log('Error deleting document:', docId);
        return { success: false, result: 'Document not found, skipping delete.' };
      }
    } catch (error) {
      console.log('Error deleting document:', error);
      throw new Error(`Failed to delete document with ID ${docId}: ${error.message}`);
    }
  }

  // In ElasticvectordbService
  async createIndexMapping() {
    try {
      const mappingsFilePath = path.join(__dirname, '..', '..', 'vectordb-mappings.json');
      const mappingsData = JSON.parse(fs.readFileSync(mappingsFilePath, 'utf-8'));

      const indexExists = await this.client.indices.exists({ index: this.indexName });

      if (!indexExists) {
        console.log('Index does not exist. Creating index...');
        await this.client.indices.create({
          index: this.indexName,
          body: mappingsData,
        });
        console.log('Index created successfully.');
      }
    } catch (error) {
      console.error('Error updating Elasticsearch index mapping:', error.message);
      throw new Error('Failed to update Elasticsearch index mapping');
    }
  }

  // In ElasticvectordbService
  async updateIndexMapping() {
    try {
      console.log("this.indexName", this.indexName);
      const mappingsFilePath = path.join(__dirname, '..', '..', 'vectordb-mappings.json');
      const mappingsData = JSON.parse(fs.readFileSync(mappingsFilePath, 'utf-8'));

      const indexExists = await this.client.indices.exists({ index: this.indexName });
      if (indexExists) {
        console.log('Index exists. Updating mapping...');
        await this.client.indices.putMapping({
          index: this.indexName,
          body: mappingsData.mappings, // Ensure `mappings` is the correct key in your JSON
        });
        console.log('Mapping updated successfully.');
      } else {
        console.log('Index does not exist. Creating index...');
        await this.createIndexMapping();
      }
    } catch (error) {
      console.error('Error updating Elasticsearch index mapping:', error.message);
      throw new Error('Failed to update Elasticsearch index mapping');
    }
  }

  // Lifecycle hook: Called when the module is initialized
  async onModuleInit() {
    try {
      await this.createIndexMapping();
    } catch (error) {
      console.error('Failed to initialize Elasticsearch index:', error.message);
    }
  }

  async getDocumentVersion(docId: string): Promise<string | null> {

    const query = {
      query: {
        term: { _id: docId },
      },
    };

    const result = await this.searchIndex(this.indexName, query);

    // Check for hits and extract versionId if present
    if (result.hits.total?.value > 0) {
      return result.hits.hits[0]._source.versionId; // Adjust based on the actual schema
    }
    return null;
  }

  async isDocumentIndexed(docId: string, versionId: any): Promise<boolean> {
    console.log("doc, versionId", docId, versionId);
    if (!docId || !versionId) {
      throw new Error('docId or versionId is null/undefined');
    }

    const query = {
      query: {
        bool: {
          must: [
            { match: { _id: docId } }, // Match title strictly
            { match: { version_id: versionId } }
          ],
        },
      }
    }

    try {
      const result = await this.searchIndex(this.indexName, query);
      //console.log("result.hits.total.value", result.hits.total.value);
      return result.hits.total.value > 0; // Use `.value` for total hits
    } catch (error) {
      console.error('Error in isDocumentIndexed:', error.message, error.stack);
      throw error;
    }
  }

  async searchIndex(indexName: string, query: any): Promise<any> {
    try {
      //console.log("query", query);
      const response = await this.client.search({
        index: indexName,
        body: query,
      });
      return response;
    } catch (error) {
      console.error(`Error searching index ${indexName}:`, error.meta?.body?.error || error.message);
      throw error; // Re-throw the error after logging
    }
  }

  getLatestDocumentPaths(): Record<string, string> {
    const basePath = this.configService.get<string>('STORAGE_DIR'); // Fetch from .env
    const result: Record<string, string> = {};

    const docIds = fs.existsSync(basePath) ? fs.readdirSync(basePath) : [];

    docIds.forEach((docId) => {
      const docPath = path.join(basePath, docId, 'document-versions');
      if (fs.existsSync(docPath)) {
        const versions = fs.readdirSync(docPath)
          .filter((version) => !isNaN(Number(version))) // Ensure it's a numeric version ID
          .map((version) => Number(version))
          .sort((a, b) => b - a); // Sort descending to get the latest version

        if (versions.length > 0) {
          const latestVersionId = versions[0];
          const originalPath = path.join(docPath, latestVersionId.toString(), 'original');

          if (fs.existsSync(originalPath)) {
            const files = fs.readdirSync(originalPath);
            if (files.length > 0) {
              const fileName = files[0]; // Assuming only one file per version
              result[docId] = path
                .join('document-versions', latestVersionId.toString(), 'original', fileName)
                .replace(/\\/g, '\\'); // Double escape for Windows-style paths
            }
          }
        }
      }
    });

    return result;
  }

  async detectLanguage(content: string): Promise<string> {
    try {
      // Assuming `langdetect` provides a detect function
      const detectedLanguages = langdetect.detect(content); // Returns an array of languages
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

// Helper function to split text into chunks at logical points
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number = 0): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    // End index for the current chunk
    let end = Math.min(start + chunkSize, text.length);

    // If not at the end, adjust to split at the nearest space or punctuation
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      const lastPunctuation = text.lastIndexOf('.', end);

      // Prefer splitting at punctuation, then space, or fall back to chunkSize
      end = Math.max(lastSpace, lastPunctuation, start + chunkSize);
    }

    chunks.push(text.slice(start, end).trim()); // Add the chunk and trim any extra whitespace
    start = end - overlap; // Move start forward with overlap
  }
  return chunks;
}

function extractVersionId(path: string): string | null {
  // Regular expression to match the version ID after "document-versions\\"
  const regex = /document-versions\\(\d+)\\/;
  const match = path.match(regex);

  // If a match is found, return the version ID; otherwise, return null
  return match ? match[1] : null;
}
