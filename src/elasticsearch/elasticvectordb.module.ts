import { Module } from '@nestjs/common';
import { ElasticvectordbService } from './elasticvectordb.service';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule], // Import ConfigModule to make ConfigService available
    providers: [ElasticvectordbService],
    exports: [ElasticvectordbService], // Export ElasticvectordbService for use in other modules
})
export class ElasticvectordbModule { }
