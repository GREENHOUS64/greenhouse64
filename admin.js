import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
const byId = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const say = (el, text, error = false) => { el.textContent = text; el.classList.toggle("error", error); };
const url = window.GREENHOUS_SUPABASE_URL;
const key = window.GREENHOUS_SUPABASE_PUBLISHABLE_KEY;
let client;
let currentUser;
if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  byId("setupNotice").classList.remove("hidden");
} else {
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  await restoreSession();
}
async function restoreSession() {
  const result = await client.auth.getSession();
  const session = result.data.session;
  if (!session) { byId("loginPanel").classList.remove("hidden"); return; }
  currentUser = session.user;
  const admin = await client.from("admin_users").select("role,is_active").eq("user_id", currentUser.id).maybeSingle();
  if (admin.error || !admin.data || !admin.data.is_active) {
    await client.auth.signOut();
    byId("loginPanel").classList.remove("hidden");
    say(byId("loginStatus"), "Для этого аккаунта нет активного доступа.", true);
    return;
  }
  byId("loginPanel").classList.add("hidden");
  byId("appPanel").classList.remove("hidden");
  byId("identity").textContent = currentUser.email + " · " + (admin.data.role === "owner" ? "владелец" : "оператор");
  await Promise.all([loadLeads(), loadPlants()]);
}
byId("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  say(byId("loginStatus"), "Проверяем доступ…");
  const result = await client.auth.signInWithPassword({ email: form.get("email"), password: form.get("password") });
  if (result.error) { say(byId("loginStatus"), "Не удалось войти. Проверьте email и пароль.", true); return; }
  await restoreSession();
});
byId("logout").addEventListener("click", async () => { await client.auth.signOut(); location.reload(); });
byId("refreshLeads").addEventListener("click", loadLeads);
const statusNames = { new: "Новая", ai_review: "На проверке ИИ", operator: "У оператора", closed: "Закрыта" };
async function loadLeads() {
  say(byId("leadStatus"), "Загружаем…");
  const result = await client.from("lead_requests").select("id,name,phone,message,status,created_at").order("created_at", { ascending: false }).limit(200);
  if (result.error) { say(byId("leadStatus"), "Не удалось загрузить заявки.", true); return; }
  const rows = result.data.map((lead) => {
    const options = Object.entries(statusNames).map(([value, label]) => '<option value="' + value + '" ' + (lead.status === value ? "selected" : "") + ">" + label + "</option>").join("");
    return "<tr><td>" + esc(new Date(lead.created_at).toLocaleString("ru-RU")) + "</td><td>" + esc(lead.name) + "</td><td><a href=\"tel:" + encodeURIComponent(lead.phone) + "\">" + esc(lead.phone) + "</a></td><td>" + esc(lead.message || "—") + '</td><td><select data-lead-id="' + esc(lead.id) + '" aria-label="Статус заявки">' + options + "</select></td></tr>";
  }).join("");
  byId("leadsBody").innerHTML = rows || '<tr><td colspan="5">Заявок пока нет.</td></tr>';
  byId("leadsBody").querySelectorAll("select[data-lead-id]").forEach((select) => select.addEventListener("change", () => updateStatus(select)));
  say(byId("leadStatus"), "Показаны последние " + result.data.length + " заявок.");
}
async function updateStatus(select) {
  const id = select.dataset.leadId;
  const previous = await client.from("lead_requests").select("status").eq("id", id).single();
  if (previous.error) { say(byId("leadStatus"), "Не удалось прочитать статус.", true); await loadLeads(); return; }
  const update = await client.from("lead_requests").update({ status: select.value }).eq("id", id);
  if (update.error) { say(byId("leadStatus"), "Не удалось изменить статус.", true); await loadLeads(); return; }
  const event = await client.from("lead_events").insert({ lead_id: id, actor_kind: "admin", actor_user_id: currentUser.id, event_type: "status_changed", from_status: previous.data.status, to_status: select.value });
  say(byId("leadStatus"), event.error ? "Статус сохранён, история не записалась." : "Статус обновлён.", Boolean(event.error));
}
async function loadPlants() {
  const result = await client.from("plants").select("id,name,category,availability,is_published").order("name").limit(500);
  if (result.error) { say(byId("plantStatus"), "Не удалось загрузить каталог.", true); return; }
  byId("plantsBody").innerHTML = result.data.map((plant) => '<tr><td>' + esc(plant.name) + "</td><td>" + esc(plant.category) + "</td><td>" + esc(plant.availability) + "</td><td>" + (plant.is_published ? "Опубликовано" : "Черновик") + '</td><td><div class="admin-toolbar"><button class="admin-button ghost" data-edit="' + esc(plant.id) + '" type="button">Изменить</button><button class="admin-button danger" data-delete="' + esc(plant.id) + '" type="button">Удалить</button></div></td></tr>').join("") || '<tr><td colspan="5">Каталог пуст.</td></tr>';
  byId("plantsBody").querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editPlant(result.data.find((plant) => plant.id === button.dataset.edit))));
  byId("plantsBody").querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deletePlant(button.dataset.delete)));
}
function resetPlant() {
  byId("plantForm").reset();
  byId("plantForm").elements.id.value = "";
  byId("plantForm").elements.is_published.value = "false";
}
function editPlant(plant) {
  const form = byId("plantForm");
  ["id", "name", "category", "description", "availability"].forEach((name) => form.elements[name].value = plant[name] || "");
  form.elements.is_published.value = String(plant.is_published);
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}
byId("resetPlant").addEventListener("click", resetPlant);
byId("plantForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const id = values.id;
  delete values.id;
  values.is_published = values.is_published === "true";
  const result = id ? await client.from("plants").update(values).eq("id", id) : await client.from("plants").insert(values);
  if (result.error) { say(byId("plantStatus"), "Не удалось сохранить позицию.", true); return; }
  resetPlant();
  say(byId("plantStatus"), "Позиция сохранена.");
  await loadPlants();
});
async function deletePlant(id) {
  if (!confirm("Удалить позицию из каталога?")) return;
  const result = await client.from("plants").delete().eq("id", id);
  if (result.error) { say(byId("plantStatus"), "Не удалось удалить позицию.", true); return; }
  say(byId("plantStatus"), "Позиция удалена.");
  await loadPlants();
}

