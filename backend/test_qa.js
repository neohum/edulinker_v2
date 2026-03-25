const API_BASE = 'http://127.0.0.1:5200';

async function test() {
    try {
        const loginRes = await fetch(`${API_BASE}/api/core/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login_id: 'admin', password: 'password' })
        });

        if (!loginRes.ok) {
            console.log("Login failed", await loginRes.text());
            return;
        }

        const data = await loginRes.json();
        const token = data.token;

        console.log("Logged in, attempting to share QA...");

        const qaRes = await fetch(`${API_BASE}/api/core/knowledge/docs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: "Test QA Document",
                source_type: "qa",
                original_filename: "ai_qa_history.md",
                content: "**질문:**\nWhat is test?\n\n**AI 규정 요약:**\nTest is a test."
            })
        });

        console.log("QA Res Status:", qaRes.status);
        console.log("QA Res Body:", await qaRes.text());

    } catch (e) {
        console.error(e);
    }
}
test();
