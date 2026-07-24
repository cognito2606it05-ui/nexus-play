console.log("Querying database proxy...");
fetch("http://127.0.0.1:4001/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sql: "SELECT * FROM otps WHERE phone = ?",
    params: ["8374477999"]
  })
})
  .then(res => {
    console.log("Status:", res.status);
    return res.text();
  })
  .then(text => console.log("Proxy response text:", text))
  .catch(err => console.error("Proxy query failed:", err));
