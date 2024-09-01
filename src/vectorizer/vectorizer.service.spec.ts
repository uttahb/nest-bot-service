import { Test, TestingModule } from '@nestjs/testing';
import { VectorizerService } from './vectorizer.service';

describe('VectorizerService', () => {
  let service: VectorizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VectorizerService],
    }).compile();

    service = module.get<VectorizerService>(VectorizerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
