import { ConfigService } from '@nestjs/config';
import { Strategy } from './types';
export declare class StrategyRegistry {
    private readonly configService;
    private readonly strategies;
    constructor(configService: ConfigService);
    getAll(): Strategy[];
    getByNames(names: string[]): Strategy[];
}
