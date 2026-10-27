/** Instructions to paste into ChatGPT or Claude so it produces a SPARK-ready file. */
export const AI_IMPORT_PROMPT = `Turn my ideas, projects and systems from our conversations into a CSV file for importing into SPARK.

Use exactly these columns, in this order:
type,title,description,status,category,tags,ref,related,source,source_url,origin,created

Rules:
- type: idea (not started), project (being built or worked on), or system (something I already run and maintain).
- title: short and specific, under 100 characters.
- description: what it is and why it matters, in my words where possible. Keep line breaks inside quotes.
- status: for ideas use spark, exploring, parked or archived. For projects use planned, active, paused, done or archived. For systems use running, needs_attention or retired. Leave blank if unsure.
- category: one broad area, like Business, Health, Family, Finance or Learning. Reuse the same spelling every time.
- tags: a few keywords separated by semicolons, like email;automation.
- ref: a short unique code for each row, like i1, p1, s1.
- related: refs of related rows separated by semicolons, like i1;s2. Only link things that genuinely connect.
- source: where it came from: ChatGPT, Claude, Personal thought, TikTok, YouTube, Book, Conversation, and so on.
- source_url: a link to the conversation or post if there is one, otherwise blank.
- origin: My idea, Co-developed, or Suggested.
- created: the date it came up, as YYYY-MM-DD, if known.

Put any value containing commas in double quotes. Don't merge separate ideas, and don't invent details. Output only the CSV in a code block.`;
