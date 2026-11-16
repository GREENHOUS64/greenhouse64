(() => {
  const id = window.GREENHOUS_GA4_ID;
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return;
  const consentKey = "greenhous-ga-consent-v1";
  const loadAnalytics = () => {
    if (window.__greenhousGaLoaded) return;
    window.__greenhousGaLoaded = true;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true });
  };
  if (localStorage.getItem(consentKey) === "accepted") { loadAnalytics(); return; }
  if (localStorage.getItem(consentKey) === "rejected") return;
  const banner = document.createElement("aside");
  banner.className = "analytics-consent";
  banner.setAttribute("aria-label", "Настройки аналитики");
  banner.innerHTML = '<p>Для статистики посещений можно включить Google Analytics. Аналитика не загрузится без вашего выбора.</p><button type="button" data-consent="yes">Разрешить</button><button type="button" data-consent="no">Не разрешать</button><a href="privacy.html">Подробнее</a>';
  document.body.appendChild(banner);
  banner.addEventListener("click", event => {
    const button = event.target.closest("[data-consent]");
    if (!button) return;
    localStorage.setItem(consentKey, button.dataset.consent === "yes" ? "accepted" : "rejected");
    banner.remove();
    if (button.dataset.consent === "yes") loadAnalytics();
  });
})();
