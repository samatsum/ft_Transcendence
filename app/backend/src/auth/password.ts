// B-04: argon2id によるパスワード検証（③§2-A）。生パスワードは保存しない。
//
// verify はハッシュ文字列（PHC形式）自体に type/cost パラメータ
// （memory 19MiB / iter 2 / parallelism 1 — OWASP推奨ライン、rest-api.md:108。
// signup 実装時に hash 側で使う）が埋め込まれているため、ここで options を渡す必要はない
// （`VerifyOptions` にも type/memoryCost 等は無い）
import * as argon2 from 'argon2';

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
	return argon2.verify(hash, plain);
}

/** ③§2-A: argon2id, memory 19MiB / iterations 2 / parallelism 1（OWASP推奨ライン） */
export function hashPassword(plain: string): Promise<string> {
	return argon2.hash(plain, {
		type: argon2.argon2id,
		memoryCost: 19 * 1024,
		timeCost: 2,
		parallelism: 1,
	});
}

/**
 * メール不存在時にも argon2.verify を1回走らせて応答時間を揃えるための固定ハッシュ
 * （③§2-A「存在しないメールと誤パスワードを区別しない」の、タイミング側での担保）。
 * 対応する平文は存在しない（このハッシュに一致することは想定されていない）。
 */
export const DUMMY_PASSWORD_HASH =
	'$argon2id$v=19$m=19456,p=1,t=2$MGf+/oOAIsblJsKFKbWajw$jn/GEHCBDVhksIbaIzsMb62Rwnano/2hb3TcN1VCFTY';
