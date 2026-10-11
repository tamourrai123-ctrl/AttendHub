"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const prisma_service_1 = require("../src/prisma/prisma.service");
async function main() {
    let app;
    try {
        app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
            logger: ['error', 'warn'],
        });
        const prisma = app.get(prisma_service_1.PrismaService);
        const result = await prisma.$queryRaw `SELECT 1 as result`;
        console.log('Database connection successful.');
        console.log(result);
    }
    catch (error) {
        console.error('Database connection failed:');
        console.error(error);
        process.exitCode = 1;
    }
    finally {
        if (app) {
            await app.close();
        }
    }
}
main();
//# sourceMappingURL=check-db-connection.js.map