import { test } from "node:test";
import assert from "node:assert/strict";
import { openaiRespond, OpenAIHttpError } from "../server/openai.ts";
import { providerOf, CLAUDE_MODELS, FAST_MODELS } from "../shared/models.ts";

function mockFetch(handler: (url: string, init: any) => Response | Promise<Response>) {
  const real = globalThis.fetch;
  globalThis.fetch = ((url: any, init: any) => Promise.resolve(handler(String(url), init))) as any;
  return () => {
    globalThis.fetch = real;
  };
}

test("the model id decides the provider; GPT models are in the shared picker list and fast-capable", () => {
  assert.equal(providerOf("gpt-6.1-sol"), "openai");
  assert.equal(providerOf("gpt-5.5"), "openai");
  assert.equal(providerOf("claude-sonnet-5"), "anthropic");
  for (const id of ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"]) {
    assert.ok(CLAUDE_MODELS.some((m) => m.id === id), id + " is selectable everywhere");
    assert.ok(FAST_MODELS.includes(id), id + " supports fast (priority) mode");
  }
});

test("openaiRespond builds a Responses API request: instructions, images before text, reasoning.effort, priority tier", async () => {
  let seen: any;
  const restore = mockFetch((url, init) => {
    seen = { url, headers: init.headers, body: JSON.parse(init.body) };
    return new Response(
      JSON.stringify({
        status: "completed",
        service_tier: "priority",
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", content: [{ type: "output_text", text: "hello " }, { type: "output_text", text: "world" }] },
        ],
        usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 }, output_tokens_details: { reasoning_tokens: 50 } },
      }),
      { status: 200 },
    );
  });
  try {
    const r = await openaiRespond(
      { model: "gpt-6.1-sol", system: "SYS", user: "USR", images: [{ data: "AAAA", mime: "image/png" }], maxOutputTokens: 500, effort: "high", fast: true },
      "sk-test",
    );
    assert.equal(r.text, "hello world");
    assert.equal(r.serviceTier, "priority");
    assert.equal(r.inputTokens, 1000);
    assert.equal(r.cachedTokens, 400);
    assert.equal(r.outputTokens, 200);
    assert.equal(r.reasoningTokens, 50);
    assert.match(seen.url, /\/responses$/);
    assert.equal(seen.headers.Authorization, "Bearer sk-test");
    assert.equal(seen.body.model, "gpt-6.1-sol");
    assert.equal(seen.body.instructions, "SYS");
    assert.equal(seen.body.max_output_tokens, 500);
    assert.deepEqual(seen.body.reasoning, { effort: "high" });
    assert.equal(seen.body.service_tier, "priority");
    assert.equal(seen.body.store, false);
    const parts = seen.body.input[0].content;
    assert.equal(parts[0].type, "input_image");
    assert.equal(parts[0].image_url, "data:image/png;base64,AAAA");
    assert.deepEqual(parts[1], { type: "input_text", text: "USR" });
  } finally {
    restore();
  }
});

test("openaiRespond surfaces the API's own error message and status (no retry on a 401)", async () => {
  let calls = 0;
  const restore = mockFetch(() => {
    calls++;
    return new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401 });
  });
  try {
    await assert.rejects(
      () => openaiRespond({ model: "gpt-6.1-sol", system: "s", user: "u", maxOutputTokens: 10, effort: "low" }, "sk-bad"),
      (e: any) => e instanceof OpenAIHttpError && e.status === 401 && /Incorrect API key/.test(e.message),
    );
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});
