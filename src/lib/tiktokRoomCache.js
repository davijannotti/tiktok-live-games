// PirateTok 0.3 caches room lookups for ten minutes, including broadcasts that ended.
export function withoutTikTokRoomCache(fetch) {
	return (input, init) => {
		const url = new URL(input instanceof Request ? input.url : input);
		if (url.hostname !== "www.tiktok.com" || url.pathname !== "/api-live/user/room") {
			return fetch(input, init);
		}
		url.searchParams.set("staleTime", "0");
		url.searchParams.set("_", String(Date.now()));
		return fetch(input instanceof Request ? new Request(url, input) : url, init);
	};
}
