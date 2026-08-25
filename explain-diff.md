# Explain Diff Guidelines

When asked to explain a code change or upcoming implementation phase, follow this framework to generate a rich, interactive, and beautifully formatted explanation.

---

## Required Sections

### 1. Background
* **Broad Background (Beginners)**: Deep foundational context on why this domain/problem exists in software engineering. Note that experienced readers can skip this part.
* **Narrow Background (Targeted)**: The specific technical context in our codebase directly relevant to this change.

### 2. Intuition
* Explain the **core philosophy and essence** of the code change rather than getting lost in minutiae.
* Use **concrete examples with toy data**.
* Include visual HTML diagrams showing data flow, system interactions, and state transformations.

### 3. Code Walkthrough
* High-level, structured walkthrough of the changes / types / logic.
* Group and sequence changes logically (dependencies first, then consumers).

### 4. Interactive Quiz
* **5 interactive multiple-choice questions** of medium difficulty to test true comprehension of the substance (no cheap gotchas).
* Provide immediate interactive feedback upon selection (correct / incorrect with detailed pedagogical explanation).

---

## Output Format & Styling Rules

* **Standalone HTML Document**: Deliver as a single, self-contained `.html` file with inline modern CSS and JavaScript.
* **File Location**: Save outside version control with today's date prefix: `/tmp/YYYY-MM-DD-explanation-<topic>.html`.
* **Tone & Writing Style**: Channel the clarity, elegance, and pedagogical precision of **Martin Kleppmann** (*Designing Data-Intensive Applications*). Use smooth prose transitions between sections.
* **No ASCII Diagrams**: Use clean, styled HTML/CSS diagram cards and flex/grid boxes.
* **Code Formatting**: Always wrap code in `<pre>` tags (or CSS `white-space: pre-wrap;`) to guarantee no newline collapsing.
* **Callouts**: Use prominent visual callout boxes for key architectural definitions, trade-offs, and critical edge cases.