// B-02: pino の起動設定。I-01 の既定 JSON ログ（`logger: true`）から一歩進め、
// レベルを環境変数で制御し、Cookie/Authorization をログから redact する
// （B-04 でセッション Cookie が載ったときにログへ生の値が漏れないよう先に手当てする）
import type { FastifyServerOptions } from 'fastify';

export function loggerOptions(): FastifyServerOptions['logger'] {
	return {
		level: process.env.LOG_LEVEL ?? 'info',
		redact: {
			paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
			censor: '[redacted]',
		},
	};
}
