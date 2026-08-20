import { useParams } from 'react-router-dom';

import { Card } from '../components/Card.js';

// F-09 の担当（プロフィール/統計/履歴 + 本人編集）。ここは stub

export default function ProfilePage() {
	const { id = '' } = useParams();
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
			<h1 className="text-heading-md">プロフィール #{id}</h1>
			<Card>
				<p className="text-body text-slate-400">
					このページは F-09 で実装します（統計・履歴・本人編集・アバター）。
				</p>
			</Card>
		</div>
	);
}
