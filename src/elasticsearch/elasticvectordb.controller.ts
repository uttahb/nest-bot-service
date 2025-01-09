import { Controller, Post, Get, Param, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ElasticvectordbService } from './elasticvectordb.service';

@Controller('elasticsearch')
export class ElasticvectordbController {

  private readonly logger = new Logger(ElasticvectordbController.name);
  constructor(
    private elasticvectordbService: ElasticvectordbService,
  ) { }

  @Post('vectorize')
  async vectorizeDocuments(@Body() docPaths: { [key: string]: string }) {
    try {
      const indexed: { doc_id: string; version_id: string; reason: string }[] = [];
      const unindexed: { doc_id: string; version_id: string; reason: string }[] = [];

      // Input validation
      if (!docPaths || Object.keys(docPaths).length === 0) {
        this.logger.error('No document paths provided.');
        throw new HttpException('No document paths provided', HttpStatus.BAD_REQUEST);
      }

      // Process documents in smaller chunks
      const documentChunks = this.chunkArray(Object.entries(docPaths), 10); // Process 10 documents at a time
      for (const chunk of documentChunks) {
        // console.log("Object.fromEntries(chunk)", Object.fromEntries(chunk));
        const documents = await this.elasticvectordbService.loadDocumentsFromPaths(Object.fromEntries(chunk));

        if (!documents || documents.length === 0) {
          this.logger.error('No documents loaded from the provided paths in chunk.');
          throw new HttpException('No documents loaded from the provided paths', HttpStatus.BAD_REQUEST);
        }

        for (const doc of documents) {
          await this.processDocument(doc, indexed, unindexed);
        }
      }

      // Consolidated response
      const response = {
        message: 'Document processing completed.',
        summary: {
          total: Object.keys(docPaths).length,
          indexed: indexed.length,
          unindexed: unindexed.length,
        },
        details: {
          indexed,
          unindexed,
        },
      };

      this.logger.log('Document vectorization process completed successfully.');
      return response;
    } catch (error) {
      const errorMessage = error instanceof HttpException ? error.message : 'Internal Server Error';
      this.logger.error('Error in vectorizing documents', error.stack);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Process an individual document.
   */
  private async processDocument(
    doc: { document_id: string; version_id: string; path: string; title: string; content: string; reason: string },
    indexed: { doc_id: string; version_id: string; reason: string }[],
    unindexed: { doc_id: string; version_id: string; reason: string }[]
  ) {

    const { document_id: docId, version_id: versionId, path, title, content } = doc;
    if (!title || !content) {
      const reason = doc.reason !== '' ? doc.reason : 'Document is missing title or content.';
      this.logger.warn(`Skipping document ${docId}: ${reason}`);
      unindexed.push({ doc_id: docId, version_id: versionId || '', reason });
      return;
    }

    if (!versionId) {
      const reason = 'Version ID not found in path.';
      this.logger.warn(`Skipping document ${docId}: ${reason}`);
      unindexed.push({ doc_id: docId, version_id: '', reason });
      return;
    }

    try {
      const isIndexed = await this.elasticvectordbService.isDocumentIndexed(docId, versionId);
      if (isIndexed) {
        const existingVersionId = await this.elasticvectordbService.getDocumentVersion(docId);

        if (existingVersionId && existingVersionId !== versionId) {
          await this.deleteAndRecreateDocument({ docId, path });
          const reason = `Document recreated with new version ${versionId} (previous version: ${existingVersionId}).`;
          this.logger.log(reason);
          indexed.push({ doc_id: docId, version_id: versionId, reason });
        } else {
          const reason = 'Document is already indexed with the same version.';
          this.logger.log(`Skipping document ${docId}: ${reason}`);
          unindexed.push({ doc_id: docId, version_id: versionId, reason });
        }
      } else {
        await this.elasticvectordbService.vectorizeDocument(doc);
        const reason = `Document indexed with docId ${docId} and version ${versionId}.`;
        this.logger.log(reason);
        indexed.push({ doc_id: docId, version_id: versionId, reason });
      }
    } catch (error) {
      const reason = `Failed to process document: ${error.message}`;
      this.logger.error(`Error processing document ${docId}: ${reason}`, error.stack);
      unindexed.push({ doc_id: docId, version_id: versionId, reason });
    }
  }

  /**
   * Utility to chunk an array into smaller arrays.
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
      array.slice(i * size, i * size + size)
    );
  }

  // Delete and recreate a document
  @Post('recreate')
  async deleteAndRecreateDocument(@Body() docPaths: { [key: string]: string }) {
    try {
      const deletedRecords: { docId: string; status: string }[] = [];
      const failedRecords: { docId: string; reason: string }[] = [];

      for (const [docId, relativePath] of Object.entries(docPaths)) {
        try {
          // Step 1: Log the initiation of the process for the document
          this.logger.log(`Starting process to delete and recreate document with ID: ${docId}`);

          // Step 2: Delete the existing document from the database
          const deleteResponse = await this.elasticvectordbService.deleteDocument(docId);
          if (!deleteResponse.success) {
            throw new Error(`Failed to delete document: ${deleteResponse.result}`);
          }
          this.logger.log(`Document with ID: ${docId} deleted successfully.`);

          // Step 3: Extract the document from the specified path
          const document = await this.elasticvectordbService.extractDocFromthePath(docId, relativePath);
          if (!document) {
            throw new Error(`Document extraction failed for ID: ${docId}`);
          }

          // Step 4: Vectorize the new document
          await this.elasticvectordbService.vectorizeDocument(document);
          this.logger.log(`Document with ID: ${docId} vectorized successfully.`);

          // Add to deleted records after successful processing
          deletedRecords.push({ docId, status: 'Recreated successfully' });
        } catch (error) {
          // Log and collect details of any errors encountered
          this.logger.error(`Error processing document with ID: ${docId} - ${error.message}`);
          failedRecords.push({ docId, reason: error.message });
        }
      }

      // Step 5: Return a summary of the operation
      return {
        message: 'Document processing completed',
        successCount: deletedRecords.length,
        failureCount: failedRecords.length,
        deletedRecords,
        failedRecords,
      };
    } catch (error) {
      // Handle unexpected errors and log them
      this.logger.error('Unexpected error in deleteAndRecreateDocument:', error.stack);
      throw new HttpException(error.message || 'Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Delete a document
  @Post('delete/:id')
  async deleteDocument(@Param('id') docId: string) {
    try {

      this.logger.log(`deleting document with ID: ${docId}`);

      const deleteResponse = await this.elasticvectordbService.deleteDocument(docId);
      if (!deleteResponse.success) {
        throw new HttpException(`Failed to delete document: ${deleteResponse.result}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      this.logger.log(`Document with ID: ${docId} deleted successfully.`);

      return {
        message: 'Document deleted successfully',
        documentId: docId,
      };

    } catch (error) {
      this.logger.error(`Error in recreating document with ID: ${docId}`, error.stack);
      throw new HttpException(error.message || 'Internal Server Error', error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('update-index-mapping')
  updateIndexMapping() {
    return this.elasticvectordbService.updateIndexMapping();
  }

  @Get('latest-paths')
  getLatestPaths() {
    return this.elasticvectordbService.getLatestDocumentPaths();
  }

}