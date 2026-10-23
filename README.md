```js
fetch("https://raw.githubusercontent.com/Von-Hohenheim/Minibia/refs/heads/main/minibia-copilot.js?v=" + Date.now())
  .then((r) => r.text())
  .then((code) => eval(code));
```

