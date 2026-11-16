const corsHeaders = { "Access-Control-Allow-Headers": "apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
function reply(status: number, body: Record<string, unknown>, origin?: string) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...(origin ? { "Access-Control-Allow-Origin": origin } : {}), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (request) => {
  const allowedOrigin = "https://greenhous64.github.io";
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigin || origin !== allowedOrigin) return reply(403, { error: "Origin is not allowed" });
  if (request.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin } });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  try {
    const payload = await request.json();
    if (typeof payload.website === "string" && payload.website.trim()) return reply(200, { ok: true }, origin);
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    if (name.length < 1 || name.length > 100 || phone.length < 7 || phone.length > 32 || !(new RegExp("^[+]?[0-9 ()-]{7,32}$")).test(phone) || message.length > 3000 || payload.consent !== true) return reply(400, { error: "Проверьте имя, телефон и согласие на обработку данных." }, origin);
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (!ip) return reply(400, { error: "Не удалось проверить запрос. Попробуйте позже." }, origin);
    const url = Deno.env.get("SUPABASE_URL");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const key = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Server configuration is incomplete");
    const response = await fetch(url + "/rest/v1/rpc/submit_lead", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_name: name, p_phone: phone, p_message: message, p_consent_at: new Date().toISOString(),
        p_consent_version: "2026-11-16", p_ip_hash: await sha256(key + ":" + ip),
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (String(error.message ?? "").includes("rate limit exceeded")) return reply(429, { error: "Слишком много обращений. Попробуйте позже." }, origin);
      console.error("submit-lead database error", error.code ?? response.status);
      return reply(500, { error: "Не удалось сохранить обращение. Позвоните оператору." }, origin);
    }
    return reply(200, { ok: true }, origin);
  } catch (error) {
    console.error("submit-lead request error", error instanceof Error ? error.message : "unknown");
    return reply(400, { error: "Не удалось обработать обращение. Проверьте данные и попробуйте снова." }, origin);
  }
});



