/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

type RedirectRow = {
	id: string;
	redirect_url: string;
	created_at: number;
	expires: number;
};

export default {
	async fetch(request, env, _): Promise<Response> {
		let requested_url = new URL(request.url);

		console.debug({
			params: requested_url.searchParams,
			path: requested_url.pathname,
		});

		if (requested_url.pathname.startsWith("/add")) {
			console.time("add");
			let url;
			try {
				url = new URL(requested_url.searchParams.get("url") ?? "");
			} catch (e) {
				console.timeEnd("add");
				console.debug("invalid url", requested_url.searchParams.get("url"), e);
				return new Response(JSON.stringify({ error: "unparsable url" }), { status: 400 });
			}
			let expires = requested_url.searchParams.get("expires") ?? null;
			if (!expires) {
				// 3 days
				expires = (60*60*24*3).toString();
			}
			let parsed_expires;
			try {
				parsed_expires = Number(expires);
				if (parsed_expires < 0) {
					throw new Error("Expires must be a positive number");
				}
			} catch (e) {
				console.timeEnd("add");
				console.debug("invalid expires", expires, e);
				return new Response(JSON.stringify({ error: e }), { status: 400 });
			}
			if (!url) {
				console.timeEnd("add");
				console.debug("no url");
				return new Response(JSON.stringify({ error: "No url" }), { status: 400 });
			}
			let db = env.redirector_db;
			let id = random_id(7);
			for (let i = 0; i < 10; i++) {
				if (await db.prepare(`SELECT * FROM redirector WHERE id = ?`).bind(id).first()) {
					id = random_id(7);
				} else {
					break;
				}
			}
			await db.prepare(`INSERT INTO redirector (id, redirect_url, created_at, expires) VALUES (?, ?, ?, ?)`).bind(id, url.toString(), Date.now(), parsed_expires).run();
			console.timeEnd("add");
			return new Response(JSON.stringify({ id: id, url: url, expires: Number(expires) }), { status: 200 });
		}
		else if (requested_url.pathname.startsWith("/get")) {
			console.time("get");
			let id = requested_url.searchParams.get("id");
			if (!id) {
				console.timeEnd("get");
				console.debug("no id");
				return new Response(JSON.stringify({ error: "No id" }), { status: 400 });
			}
			let db = env.redirector_db;
			let row = await db.prepare(`SELECT * FROM redirector WHERE id = ?`).bind(id).first<RedirectRow>();
			if (!row) {
				console.timeEnd("get");
				console.debug("not found", id);
				return new Response(JSON.stringify({ error: "Not found" }), { status: 400 });
			}
			let expires = row.expires;
			let created_at = row.created_at;
			let now = Date.now();
			if (now > created_at + (expires * 1000)) {
				console.timeEnd("get");
				console.debug("expired", id);
				await db.prepare(`DELETE FROM redirector WHERE id = ?`).bind(id).run();
				return new Response(JSON.stringify({ error: "Expired" }), { status: 400 });
			}
			let expired_at = new Date();
			expired_at.setTime(created_at + (expires * 1000));
			console.timeEnd("get");
			return new Response(JSON.stringify({ url: row.redirect_url, expires: expired_at }), { status: 200 });

		} else if (requested_url.pathname.split("/").length === 2) {
			// fully expecting url with one path
			console.time("redirect");
			let id = requested_url.pathname.split("/")[1];
			if (!id) {
				console.timeEnd("redirect");
				console.debug("no url");
				return new Response(JSON.stringify({ error: "No url" }), { status: 400 });
			}
			let db = env.redirector_db;
			let row = await db.prepare(`SELECT * FROM redirector WHERE id = ?`).bind(id).first<RedirectRow>();
			if (!row) {
				console.timeEnd("redirect");
				console.debug("not found", id);
				return new Response(JSON.stringify({ error: "Not found" }), { status: 400 });
			}
			let expires = row.expires;
			let created_at = row.created_at;
			let now = Date.now();
			if (now > created_at + (expires * 1000)) {
				console.timeEnd("redirect");
				console.debug("expired", id);
				await db.prepare(`DELETE FROM redirector WHERE id = ?`).bind(id).run();
				return new Response(JSON.stringify({ error: "Expired" }), { status: 400 });
			}
			let expired_at = new Date();
			expired_at.setTime(created_at + (expires * 1000));
			let header = new Headers();
			header.set("Location", row.redirect_url);
			header.set("Expires", expired_at.toUTCString());
			console.timeEnd("redirect");
			return new Response(null, { status: 302, headers: header });
		} else {
			return new Response(JSON.stringify({ error: "Invalid path" }), { status: 400 });
		}
	},
	async scheduled(_, env, _2): Promise<void> {
		console.time("scheduled task deleting records");
		await env.redirector_db.prepare(`DELETE FROM redirector WHERE (expires * 1000) + created_at < ?`).bind(Date.now()).run();
		console.timeEnd("scheduled task deleting records");
	}
} satisfies ExportedHandler<Env>;

function random_id(length: number): string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return result;
}
