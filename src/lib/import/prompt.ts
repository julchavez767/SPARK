/** Instructions to paste into ChatGPT or Claude so it produces a SPARK-ready file. */
export const AI_IMPORT_PROMPT = `Turn my ideas, projects and systems from our conversations into a JSON file for importing into SPARK, including the reasoning behind each one.

Output a single JSON object shaped like this:
{
  "items": [
    {
      "type": "idea",
      "title": "…",
      "description": "…",
      "status": "exploring",
      "category": "Business",
      "tags": ["email", "automation"],
      "ref": "i1",
      "related": ["s1"],
      "source": "ChatGPT",
      "source_url": "",
      "origin": "Co-developed",
      "created": "2025-03-01",
      "reasoning": [
        { "type": "hypothesis", "text": "…", "date": "2025-03-01" },
        { "type": "decision", "text": "…", "date": "" }
      ]
    }
  ]
}

Item rules:
- type: idea (not started), project (being built or worked on), or system (something I already run and maintain).
- title: short and specific, under 100 characters. Use exactly the same title I already use for anything that's already in SPARK.
- description: what it is and why it matters, in my words where possible.
- status: for ideas use spark, exploring, parked or archived. For projects use planned, active, paused, done or archived. For systems use running, needs_attention or retired. Leave blank if unsure.
- category: one broad area, like Business, Health, Family, Finance or Learning. Reuse the same spelling every time.
- tags: a few keywords.
- ref: a short unique code for each item, like i1, p1, s1.
- related: refs of related items. Only link things that genuinely connect.
- source: where it came from: ChatGPT, Claude, Personal thought, TikTok, YouTube, Book, Conversation, and so on.
- source_url: a link to the conversation or post if there is one, otherwise blank.
- origin: My idea, Co-developed, or Suggested.
- created: the date it first came up, as YYYY-MM-DD, only if known.

Reasoning rules (the "reasoning" list on each item, oldest first):
- type: note (context or a thought), hypothesis (something I believe might be true), challenge (a risk, doubt, assumption or open question), decision (what I decided and why), or lesson (what I learned).
- text: one thought per entry, in my words where possible. Keep separate thoughts as separate entries.
- date: the date the thought was actually formed, as YYYY-MM-DD, or YYYY-MM or YYYY if only that is known. Leave it blank when the conversation doesn't show the date. Never guess or use today's date.
- Don't repeat the same entry, and don't put reasoning in the description.

Don't merge separate ideas, and don't invent details. Output only the JSON in a code block.`;
