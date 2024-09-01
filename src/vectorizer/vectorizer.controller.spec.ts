import { Test, TestingModule } from '@nestjs/testing';
import { VectorizerController } from './vectorizer.controller';

describe('VectorizerController', () => {
  let controller: VectorizerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VectorizerController],
    }).compile();

    controller = module.get<VectorizerController>(VectorizerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
