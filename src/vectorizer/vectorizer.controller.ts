import { Controller, Get } from '@nestjs/common';
import { VectorizerService } from './vectorizer.service';

@Controller('vectorizer')
export class VectorizerController {
  constructor(private readonly vectorizerService: VectorizerService) {}
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
