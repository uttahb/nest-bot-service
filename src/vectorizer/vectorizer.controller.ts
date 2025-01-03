import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { VectorizerService } from './vectorizer.service';
//import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';

@Controller('vectorizer')
export class VectorizerController {
  constructor(
    private readonly vectorizerService: VectorizerService,
    //private elasticsearchService: ElasticsearchService,
  ) {}
  @Get('reindex')
  async reindex() {
    try {
      await this.vectorizerService.reIndex();
      return {
        response: 'reindexing started',
      };
    } catch (e) {
      console.log(e);
      return {
        response: 'reindexing failed',
      };
    }
  }
  
}
