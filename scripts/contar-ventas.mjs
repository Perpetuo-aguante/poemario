// Cuenta los ejemplares vendidos en Stripe y escribe ventas.json.
// Solo guarda el total: ningún dato de compradores sale de Stripe.
// Requiere STRIPE_KEY (llave restringida con lectura de Checkout Sessions y Payment Links).
import { writeFileSync, readFileSync, existsSync } from "node:fs";

// Enlaces de pago → ejemplares por unidad comprada
const ENLACES = {
  "https://buy.stripe.com/6oU8wP4q9e6f8BXc0AcAo03": 1, // Lector
  "https://buy.stripe.com/aFa4gzf4Nd2b19vd4EcAo04": 1, // Mecenas
  "https://buy.stripe.com/aFa5kD2i13rBbO9ggQcAo05": 3, // Editor honorario
};

const KEY = process.env.STRIPE_KEY;
if (!KEY) { console.error("Falta STRIPE_KEY"); process.exit(1); }

async function listar(ruta, params = {}) {
  const todos = [];
  let despues;
  while (true) {
    const q = new URLSearchParams({ limit: "100", ...params });
    if (despues) q.set("starting_after", despues);
    const r = await fetch(`https://api.stripe.com/v1/${ruta}?${q}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`${ruta}: ${j.error?.message || r.status}`);
    todos.push(...j.data);
    if (!j.has_more) return todos;
    despues = j.data.at(-1).id;
  }
}

const links = await listar("payment_links");
let vendidos = 0;
for (const [url, porUnidad] of Object.entries(ENLACES)) {
  const link = links.find(l => l.url === url);
  if (!link) throw new Error(`No encontré en Stripe el enlace ${url}`);
  const sesiones = await listar("checkout/sessions", {
    payment_link: link.id,
    status: "complete",
    "expand[]": "data.line_items",
  });
  let n = 0;
  for (const s of sesiones) {
    if (s.payment_status !== "paid") continue;
    for (const li of s.line_items?.data ?? []) n += (li.quantity || 1) * porUnidad;
  }
  console.log(`${url}: ${sesiones.length} pagos → ${n} ejemplares`);
  vendidos += n;
}

const previo = existsSync("ventas.json") ? JSON.parse(readFileSync("ventas.json", "utf8")).vendidos : null;
if (previo === vendidos) { console.log(`Sin cambios (${vendidos})`); process.exit(0); }
writeFileSync("ventas.json", JSON.stringify({ vendidos, actualizado: new Date().toISOString() }, null, 2) + "\n");
console.log(`Total: ${vendidos} ejemplares`);
