import React, { useEffect, useState } from "react";

/*
  Frontend notes:
  - Set the backend base URL via environment variable:
      VITE_API_BASE_URL=https://your-api.example.com
    If omitted, the client will call the same origin (relative paths).
  - In production set VITE_API_BASE_URL in your host (Vercel/GitHub Pages build env).
*/

const ENV_BASE = import.meta.env.VITE_API_BASE_URL || "";
const API_BASE = ENV_BASE ? ENV_BASE.replace(/\/+$/, "") : (typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "");

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

function CheckoutContact({ onSubmit, onCancel }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!name || !email || !phone) return alert("Please fill name, email and phone");
    onSubmit({ name, email, phone });
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h3 className="font-semibold mb-4">Checkout — Contact details</h3>

        <label className="text-sm">Name</label>
        <input className="search-input mb-4" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="text-sm">Email</label>
        <input className="search-input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="text-sm">Phone</label>
        <input className="search-input mb-4" value={phone} onChange={(e) => setPhone(e.target.value)} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="cta">Continue to Pay</button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const SAMPLE_PRODUCTS = [
    { id: "p1", title: "Classic Leather Bag", price: 129.0, imageAlt: "Leather bag", inventory: 6 },
    { id: "p2", title: "Minimalist Watch", price: 89.0, imageAlt: "Watch", inventory: 10 },
    { id: "p3", title: "Running Sneakers", price: 99.0, imageAlt: "Sneakers", inventory: 4 },
    { id: "p4", title: "Noise-Cancelling Headphones", price: 199.0, imageAlt: "Headphones", inventory: 3 },
    { id: "p5", title: "Organic Cotton T-Shirt", price: 25.0, imageAlt: "T-Shirt", inventory: 24 },
    { id: "p6", title: "Smartphone Stand", price: 19.0, imageAlt: "Phone stand", inventory: 50 }
  ];

  const [products] = useState(SAMPLE_PRODUCTS);
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cart_v1") || "{}"); } catch { return {}; }
  });
  const [isCartOpen, setCartOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("cart_v1", JSON.stringify(cart)); } catch {}
  }, [cart]);

  const addToCart = (productId) => {
    setCart((prev) => {
      const qty = prev[productId] ? prev[productId] + 1 : 1;
      return { ...prev, [productId]: qty };
    });
    setCartOpen(true);
  };

  const updateQty = (productId, qty) => {
    setCart((prev) => {
      if (qty <= 0) {
        const n = { ...prev };
        delete n[productId];
        return n;
      }
      return { ...prev, [productId]: qty };
    });
  };

  const clearCart = () => setCart({});

  const cartItems = Object.keys(cart).map((id) => {
    const p = products.find((x) => x.id === id);
    return p ? { ...p, qty: cart[id] } : null;
  }).filter(Boolean);

  const subtotal = cartItems.reduce((s, it) => s + it.price * it.qty, 0);
  const shipping = subtotal > 150 ? 0 : subtotal === 0 ? 0 : 9.99;
  const tax = +(subtotal * 0.12).toFixed(2);
  const total = +(subtotal + shipping + tax).toFixed(2);

  const filtered = products.filter((p) => {
    if (query && !p.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (minPrice && p.price < Number(minPrice)) return false;
    if (maxPrice && p.price > Number(maxPrice)) return false;
    return true;
  });

  function scrollToProducts() {
    const y = document.querySelector("main")?.offsetTop || 700;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  function startCheckout() {
    if (cartItems.length === 0) return alert("Cart is empty");
    setShowContactForm(true);
  }

  async function onContactSubmit(contact) {
    setShowContactForm(false);
    await handleRazorpayCheckout(contact);
  }

  async function handleRazorpayCheckout(contact = null) {
    setIsProcessingPayment(true);
    try {
      const payload = { amountINR: total, receipt: `rcpt_${Date.now()}` };
      if (contact) {
        payload.customerName = contact.name;
        payload.customerEmail = contact.email;
        payload.customerPhone = contact.phone;
      }

      const createUrl = apiUrl("/api/razorpay/create-order");
      const resp = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then((r) => r.json());

      if (resp.error) throw new Error(resp.error || "order creation failed");

      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        });
      }

      const options = {
        key: resp.key,
        amount: resp.amount,
        currency: resp.currency,
        name: "YourBrand",
        description: "Order payment",
        order_id: resp.orderId,
        handler: function (paymentResponse) {
          const verifyUrl = apiUrl("/api/razorpay/verify");
          fetch(verifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(paymentResponse)
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.ok) {
                clearCart();
                setCartOpen(false);
                alert("Payment successful! Order placed.");
              } else {
                alert("Payment verification failed on server.");
              }
            })
            .catch((err) => {
              console.error(err);
              alert("Verification failed.");
            });
        },
        prefill: {
          name: contact ? contact.name : "",
          email: contact ? contact.email : ""
        },
        modal: {
          ondismiss: function () {}
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error(err);
      alert("Payment failed: " + (err.message || "unknown error"));
    } finally {
      setIsProcessingPayment(false);
    }
  }

  return (
    <div>
      <header className="header">
        <div className="max-w-7xl px-4 py-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="font-bold" style={{ fontSize: 20 }}>YourBrand</div>
          </div>

          <div className="flex items-center gap-4">
            <input
              aria-label="Search products"
              placeholder="Search products..."
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="button" onClick={() => setCartOpen((s) => !s)}>
              Cart <span style={{ marginLeft: 8, background: "#eef2ff", padding: "2px 8px", borderRadius: 12 }}>{cartItems.length}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl px-4" style={{ paddingTop: 24 }}>
        {/* HERO */}
        <section className="bg-white rounded shadow mb-8" style={{ padding: 24 }}>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 32, margin: 0 }}>Discover thoughtful design, lasting quality.</h1>
              <p className="small" style={{ marginTop: 8 }}>Handpicked products — free shipping over ₹150.</p>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button className="cta" onClick={scrollToProducts}>Shop Now</button>
                <button className="button">Learn more</button>
              </div>
            </div>

            <div style={{ width: 320 }}>
              <div className="img-placeholder">
                <img src="/hero-product.jpg" alt="Featured" style={{ maxWidth: "100%", borderRadius: 8 }} />
              </div>
              <div className="small" style={{ marginTop: 8 }}>Limited time: use code <strong>SAVE10</strong></div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="mb-6" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Shop</h2>
            <div className="small">Curated products — replace with your catalog</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label className="small">Price</label>
            <input className="search-input" placeholder="Min" style={{ width: 80 }} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
            <input className="search-input" placeholder="Max" style={{ width: 80 }} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            <button className="button" onClick={() => { setMinPrice(""); setMaxPrice(""); setQuery(""); }}>Clear</button>
          </div>
        </section>

        {/* Product grid */}
        <section>
          <div className="grid">
            {filtered.map((p) => (
              <article key={p.id} className="card">
                <div className="img-placeholder mb-4">{p.imageAlt}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0 }}>{p.title}</h3>
                  <div className="small" style={{ marginTop: 8 }}>{p.inventory > 0 ? `${p.inventory} in stock` : "Out of stock"}</div>
                </div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700 }}>₹{p.price.toFixed(2)}</div>
                  <div>
                    <button className="button" onClick={() => addToCart(p.id)} disabled={p.inventory === 0}>Add</button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filtered.length === 0 && <div style={{ marginTop: 24, textAlign: "center", color: "#6b7280" }}>No products match your search/filters.</div>}
        </section>
      </main>

      {/* Cart Drawer */}
      <aside className={`cart-drawer ${isCartOpen ? "open" : ""}`}>
        <div style={{ padding: 16, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Your cart</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button" onClick={clearCart}>Clear</button>
            <button className="button" onClick={() => setCartOpen(false)}>Close</button>
          </div>
        </div>

        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {cartItems.length === 0 && <div className="small">Your cart is empty.</div>}

          {cartItems.map((it) => (
            <div key={it.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ width: 64, height: 64, background: "#f3f4f6", borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{it.title}</div>
                <div className="small">₹{it.price.toFixed(2)} each</div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="button" onClick={() => updateQty(it.id, it.qty - 1)}>-</button>
                  <div>{it.qty}</div>
                  <button className="button" onClick={() => updateQty(it.id, it.qty + 1)}>+</button>
                </div>
              </div>
              <div style={{ fontWeight: 700 }}>₹{(it.price * it.qty).toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: 16, borderTop: "1px solid #eee" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div className="small">Subtotal</div><div>₹{subtotal.toFixed(2)}</div></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div className="small">Shipping</div><div>{shipping === 0 ? "Free" : `₹${shipping.toFixed(2)}`}</div></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><div className="small">Tax</div><div>₹{tax.toFixed(2)}</div></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 12 }}><div>Total</div><div>₹{total.toFixed(2)}</div></div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={startCheckout} className="cta" style={{ flex: 1 }}>{isProcessingPayment ? "Processing…" : `Pay ₹${total.toFixed(2)}`}</button>
            <button className="button" onClick={() => setCartOpen(false)}>Continue</button>
          </div>
        </div>
      </aside>

      {showContactForm && <CheckoutContact onSubmit={onContactSubmit} onCancel={() => setShowContactForm(false)} />}

      <footer className="footer">
        © {new Date().getFullYear()} YourBrand — Built with this starter
      </footer>
    </div>
  );
}
