/* Edit ONLY this file. Every {{PLACEHOLDER}} in the legal pages is replaced with these values. */
window.SITE = {
  APP_NAME: "Chobi",
  OWNER_NAME: "YOUR NAME OR BUSINESS NAME",
  CONTACT_EMAIL: "you@example.com",
  SITE_URL: "https://your-username.github.io/your-repo/",
  JURISDICTION: "kolkata, West Bengal, India"
};
(function () {
  var run = function () {
    var f = function (s) { return s.replace(/\{\{(\w+)\}\}/g, function (m, k) { return window.SITE[k] || m; }); };
    document.title = f(document.title);
    document.body.innerHTML = f(document.body.innerHTML);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
