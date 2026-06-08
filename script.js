(function () {
  "use strict";

  const STORAGE_WRONG = "question-bank-wrong-v1";
  const STORAGE_DATA = "question-bank-data-v1";
  const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];
  const CREEDS = [
    "知识不是光，它只是让你看清黑暗的轮廓。",
    "每一道错题都是伤口，复盘是让它结痂的仪式。",
    "侥幸会沉默地腐烂，纪律会冷静地发光。",
    "答案不会拯救你，理解才会。",
    "恐惧来自未知，分数来自对未知的反复拆解。"
  ];
  const MODE_LABELS = {
    browse: "ARCHIVE",
    exam: "STRESS TEST",
    wrong: "TRAUMA LOG"
  };

  const state = {
    questions: [],
    filtered: [],
    view: "browse",
    wrongIds: new Set(JSON.parse(localStorage.getItem(STORAGE_WRONG) || "[]")),
    exam: null
  };

  const els = {
    questionCount: document.getElementById("questionCount"),
    csvInput: document.getElementById("csvInput"),
    loadSampleBtn: document.getElementById("loadSampleBtn"),
    searchInput: document.getElementById("searchInput"),
    categoryFilter: document.getElementById("categoryFilter"),
    difficultyFilter: document.getElementById("difficultyFilter"),
    questionList: document.getElementById("questionList"),
    wrongList: document.getElementById("wrongList"),
    wrongSummary: document.getElementById("wrongSummary"),
    clearWrongBtn: document.getElementById("clearWrongBtn"),
    examSize: document.getElementById("examSize"),
    startExamBtn: document.getElementById("startExamBtn"),
    examArea: document.getElementById("examArea"),
    creedText: document.getElementById("creedText"),
    modeText: document.getElementById("modeText"),
    template: document.getElementById("questionTemplate")
  };

  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  els.csvInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const text = await file.text();
    loadCsv(text, file.name);
  });

  els.loadSampleBtn.addEventListener("click", async () => {
    const text = await fetchText("./sample.csv");
    loadCsv(text, "sample.csv");
  });

  els.searchInput.addEventListener("input", applyFilters);
  els.categoryFilter.addEventListener("change", applyFilters);
  els.difficultyFilter.addEventListener("change", applyFilters);
  els.startExamBtn.addEventListener("click", startExam);
  els.clearWrongBtn.addEventListener("click", () => {
    state.wrongIds.clear();
    saveWrongIds();
    renderWrong();
  });

  bootstrap();
  rotateCreed();

  async function bootstrap() {
    try {
      const text = await fetchText("./data.csv");
      loadCsv(text, "data.csv");
    } catch (error) {
      const cached = localStorage.getItem(STORAGE_DATA);
      if (cached) {
        setQuestions(JSON.parse(cached), "本地缓存");
      } else {
        renderAll();
      }
    }
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取 " + url);
    return response.text();
  }

  function loadCsv(text, sourceName) {
    const rows = parseCsv(text);
    if (rows.length < 2) {
      alert("CSV 至少需要表头和一行题目。");
      return;
    }

    const headers = rows[0].map((item) => item.trim());
    const questions = rows.slice(1)
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row, index) => normalizeQuestion(headers, row, index, sourceName))
      .filter((question) => question.title && question.answer.length);

    if (!questions.length) {
      alert("没有识别到有效题目，请检查题干和答案列。");
      return;
    }

    localStorage.setItem(STORAGE_DATA, JSON.stringify(questions));
    setQuestions(questions, sourceName);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    row.push(field);
    rows.push(row);
    return rows;
  }

  function normalizeQuestion(headers, row, index, sourceName) {
    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = (row[headerIndex] || "").trim();
    });

    const title = pick(record, ["题目", "题干", "question", "title", "stem"]);
    const answer = normalizeAnswer(pick(record, ["答案", "正确答案", "answer", "correct", "correct_answer"]));
    const explanation = pick(record, ["解析", "解释", "explanation", "analysis", "note", "tip"]);
    const type = pick(record, ["题型", "类型", "type"]);
    const category = pick(record, ["分类", "科目", "章节", "category", "subject", "chapter"]) || typeLabel(type) || "未分类";
    const difficulty = pick(record, ["难度", "difficulty", "level"]) || "普通";
    const id = pick(record, ["id", "ID", "编号"]) || stableId(sourceName + "|" + index + "|" + title);

    const splitOptions = parseOptionsColumn(pick(record, ["选项", "options", "option", "choices"]));
    const columnOptions = OPTION_KEYS.map((key) => {
      const text = pick(record, [key, key.toLowerCase(), "选项" + key, "option" + key, "option_" + key.toLowerCase()]);
      return text ? { key, text } : null;
    }).filter(Boolean);
    const options = columnOptions.length ? columnOptions : splitOptions;

    return { id, title, answer, explanation, category, difficulty, options };
  }

  function pick(record, names) {
    const lowerMap = Object.fromEntries(Object.keys(record).map((key) => [key.toLowerCase(), key]));
    for (const name of names) {
      const direct = record[name];
      if (direct) return direct;
      const lower = lowerMap[String(name).toLowerCase()];
      if (lower && record[lower]) return record[lower];
    }
    return "";
  }

  function normalizeAnswer(value) {
    const parts = String(value || "")
      .toUpperCase()
      .split(/[、,，;；\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    return parts.flatMap((item) => /^[A-F]+$/.test(item) ? item.split("") : [item]);
  }

  function parseOptionsColumn(value) {
    return String(value || "")
      .split("|")
      .map((item, index) => {
        const text = item.trim();
        if (!text) return null;
        const match = text.match(/^([A-Fa-f])[\s.．、:：-]*(.+)$/);
        if (match) {
          return { key: match[1].toUpperCase(), text: match[2].trim() };
        }
        return { key: OPTION_KEYS[index] || String(index + 1), text };
      })
      .filter(Boolean);
  }

  function typeLabel(type) {
    const normalized = String(type || "").toLowerCase();
    if (normalized === "single") return "单选题";
    if (normalized === "multiple" || normalized === "multi") return "多选题";
    if (normalized === "judge" || normalized === "truefalse") return "判断题";
    return type;
  }

  function stableId(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return "q_" + Math.abs(hash);
  }

  function setQuestions(questions, sourceName) {
    state.questions = questions;
    state.filtered = questions;
    buildFilters();
    applyFilters();
    els.questionCount.textContent = questions.length + " 道题 · " + sourceName;
  }

  function buildFilters() {
    fillSelect(els.categoryFilter, "全部分类", unique(state.questions.map((q) => q.category)));
    fillSelect(els.difficultyFilter, "全部难度", unique(state.questions.map((q) => q.difficulty)));
  }

  function fillSelect(select, label, values) {
    const current = select.value;
    select.innerHTML = "";
    select.append(new Option(label, ""));
    values.forEach((value) => select.append(new Option(value, value)));
    select.value = values.includes(current) ? current : "";
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }

  function applyFilters() {
    const keyword = els.searchInput.value.trim().toLowerCase();
    const category = els.categoryFilter.value;
    const difficulty = els.difficultyFilter.value;

    state.filtered = state.questions.filter((question) => {
      const text = [
        question.title,
        question.explanation,
        question.category,
        question.difficulty,
        ...question.options.map((option) => option.text)
      ].join(" ").toLowerCase();

      return (!keyword || text.includes(keyword)) &&
        (!category || question.category === category) &&
        (!difficulty || question.difficulty === difficulty);
    });

    renderAll();
  }

  function renderAll() {
    renderBrowse();
    renderWrong();
    if (state.exam) renderExam();
    if (!state.questions.length) {
      els.questionCount.textContent = "等待题库";
    }
  }

  function renderBrowse() {
    renderQuestionList(els.questionList, state.filtered, "档案为空。请接入 CSV，或把 data.csv 放到本目录。");
  }

  function renderWrong() {
    const wrongQuestions = state.questions.filter((question) => state.wrongIds.has(question.id));
    els.wrongSummary.textContent = wrongQuestions.length ? wrongQuestions.length + " 道创伤记录" : "暂无创伤记录";
    renderQuestionList(els.wrongList, wrongQuestions, "暂无创伤记录。压力测试中的错误会自动归档。");
  }

  function renderQuestionList(container, questions, emptyText) {
    container.innerHTML = "";
    if (!questions.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    questions.forEach((question, index) => {
      fragment.append(renderQuestionCard(question, index));
    });
    container.append(fragment);
  }

  function renderQuestionCard(question, index) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.querySelector(".question-meta").append(
      tag("#" + (index + 1)),
      tag(question.category),
      tag(question.difficulty)
    );
    node.querySelector(".question-title").textContent = question.title;

    const options = node.querySelector(".options");
    if (question.options.length) {
      question.options.forEach((option) => options.append(renderOption(option)));
    } else {
      options.remove();
    }

    const answer = node.querySelector(".answer-content");
    answer.append(
      line("答案", question.answer.join("、")),
      line("解析", question.explanation || "暂无解析")
    );
    return node;
  }

  function renderOption(option) {
    const node = document.createElement("div");
    node.className = "option";
    node.append(keyBadge(option.key), document.createTextNode(option.text));
    return node;
  }

  function tag(text) {
    const node = document.createElement("span");
    node.className = "tag";
    node.textContent = text;
    return node;
  }

  function keyBadge(text) {
    const node = document.createElement("span");
    node.className = "option-key";
    node.textContent = text;
    return node;
  }

  function line(label, value) {
    const node = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label;
    node.append(strong, document.createTextNode("：" + value));
    return node;
  }

  function switchView(view) {
    state.view = view;
    if (els.modeText) els.modeText.textContent = MODE_LABELS[view] || "ONLINE";
    rotateCreed();
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    document.querySelectorAll(".view").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === view + "View");
    });
  }

  function startExam() {
    if (!state.filtered.length) {
      alert("当前筛选条件下没有题目。");
      return;
    }

    const size = Math.max(1, Math.min(Number(els.examSize.value) || 10, state.filtered.length));
    els.examSize.value = size;
    state.exam = {
      submitted: false,
      questions: shuffle(state.filtered).slice(0, size),
      answers: {}
    };
    renderExam();
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function renderExam() {
    els.examArea.innerHTML = "";
    if (!state.exam) return;

    const fragment = document.createDocumentFragment();
    if (state.exam.submitted) {
      fragment.append(renderExamResult());
    }

    state.exam.questions.forEach((question, index) => {
      fragment.append(renderExamQuestion(question, index));
    });

    const actions = document.createElement("div");
    actions.className = "exam-actions";
    const submit = document.createElement("button");
    submit.className = "primary-button";
    submit.type = "button";
    submit.textContent = state.exam.submitted ? "重新审判" : "提交审判";
    submit.addEventListener("click", submitExam);
    actions.append(submit);
    fragment.append(actions);
    els.examArea.append(fragment);
  }

  function renderExamQuestion(question, index) {
    const card = document.createElement("article");
    card.className = "exam-question";
    const title = document.createElement("h3");
    title.textContent = index + 1 + ". " + question.title;
    card.append(title);

    const options = document.createElement("div");
    options.className = "options";
    const selected = state.exam.answers[question.id] || [];
    question.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "exam-option";
      if (state.exam.submitted && question.answer.includes(option.key)) label.classList.add("is-correct");
      if (state.exam.submitted && selected.includes(option.key) && !question.answer.includes(option.key)) label.classList.add("is-wrong");

      const input = document.createElement("input");
      input.type = question.answer.length > 1 ? "checkbox" : "radio";
      input.name = "exam_" + question.id;
      input.value = option.key;
      input.checked = selected.includes(option.key);
      input.disabled = state.exam.submitted;
      input.addEventListener("change", () => updateExamAnswer(question.id, input));

      label.append(input, document.createTextNode(option.key + ". " + option.text));
      options.append(label);
    });
    card.append(options);

    if (state.exam.submitted) {
      const answer = document.createElement("div");
      answer.className = "answer-content";
      answer.append(
        line("正确答案", question.answer.join("、")),
        line("解析", question.explanation || "暂无解析")
      );
      card.append(answer);
    }
    return card;
  }

  function updateExamAnswer(questionId, input) {
    const current = state.exam.answers[questionId] || [];
    if (input.type === "radio") {
      state.exam.answers[questionId] = [input.value];
      return;
    }

    state.exam.answers[questionId] = input.checked
      ? uniqueAnswer(current.concat(input.value))
      : current.filter((item) => item !== input.value);
  }

  function uniqueAnswer(values) {
    return [...new Set(values)].sort();
  }

  function submitExam() {
    state.exam.submitted = true;
    state.exam.questions.forEach((question) => {
      const selected = uniqueAnswer(state.exam.answers[question.id] || []);
      if (selected.join("|") !== question.answer.slice().sort().join("|")) {
        state.wrongIds.add(question.id);
      }
    });
    saveWrongIds();
    renderExam();
    renderWrong();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderExamResult() {
    const correct = state.exam.questions.filter((question) => {
      const selected = uniqueAnswer(state.exam.answers[question.id] || []);
      return selected.join("|") === question.answer.slice().sort().join("|");
    }).length;

    const result = document.createElement("div");
    result.className = "exam-result";
    const strong = document.createElement("strong");
    strong.textContent = correct;
    result.append(
      document.createTextNode("本次得分 "),
      strong,
      document.createTextNode(" / " + state.exam.questions.length)
    );
    return result;
  }

  function saveWrongIds() {
    localStorage.setItem(STORAGE_WRONG, JSON.stringify([...state.wrongIds]));
  }

  function rotateCreed() {
    if (!els.creedText) return;
    const index = Math.floor(Math.random() * CREEDS.length);
    els.creedText.textContent = CREEDS[index];
  }
})();
