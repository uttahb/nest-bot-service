import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Express } from 'express';

interface FileRequestBody {
  userId: string;
}
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Body() body: FileRequestBody,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log(body);
    return this.uploadService.handleFileUpload(file, body.userId);
  }
}
