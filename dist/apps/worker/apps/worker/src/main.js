"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const worker_module_1 = require("./worker.module");
const config_1 = require("@nestjs/config");
async function bootstrap() {
    const app = await core_1.NestFactory.create(worker_module_1.WorkerModule);
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('WORKER_PORT', 3001);
    await app.listen(port);
}
bootstrap();
//# sourceMappingURL=main.js.map