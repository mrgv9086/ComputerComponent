"use strict";

const routeNames = ["cover", "reference", "quiz"];
let currentRoute = "cover";
let routeVersion = 0;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let routeAnimation;

async function navigate() {
  const [requestedRoute, anchor] = location.hash.slice(1).split("/");
  const route = routeNames.includes(requestedRoute) ? requestedRoute : "cover";
  const version = ++routeVersion;
  const previous = document.getElementById(currentRoute);
  routeAnimation?.cancel();
  if (route !== currentRoute && !reducedMotion.matches) {
    const animation = previous.animate([{opacity:1,transform:"translateY(0)",filter:"blur(0)"},{opacity:0,transform:"translateY(-12px)",filter:"blur(5px)"}],{duration:200,easing:"ease-in",fill:"forwards"});
    routeAnimation = animation;
    await animation.finished.catch(() => {});
    animation.cancel();
  }
  if (version !== routeVersion) return;
  document.querySelectorAll(".view").forEach(view => {view.hidden = view.id !== route;});
  document.querySelectorAll("[data-route]").forEach(link => {
    if(link.dataset.route === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const didChange = route !== currentRoute;
  currentRoute = route;
  document.body.dataset.view = route;
  if (didChange || !anchor) window.scrollTo({top:0,behavior:"instant"});
  if(didChange) {
    const next = document.getElementById(route);
    if(!reducedMotion.matches) routeAnimation = next.animate([{opacity:0,transform:"translateY(18px)",filter:"blur(5px)"},{opacity:1,transform:"translateY(0)",filter:"blur(0)"}],{duration:550,easing:"cubic-bezier(.22,1,.36,1)"});
    if(route !== "cover") document.getElementById(`${route}-title`).focus({preventScroll:true});
  }
  if (route === "reference" && referenceSections.some(section => section.id === anchor)) {
    document.getElementById(anchor).scrollIntoView({behavior:reducedMotion.matches ? "instant" : "smooth",block:"start"});
  }
  document.title = ({cover:"Что внутри компьютера",reference:"Краткий справочник",quiz:"Тест по устройству компьютера"}[route]) + " — Информатика, 7 класс";
}
window.addEventListener("hashchange", navigate);
document.querySelector(".skip-link").addEventListener("click", event => {
  event.preventDefault();
  document.getElementById("main").focus({preventScroll:true});
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text) node.textContent = text;
  return node;
}

const referenceContent = document.getElementById("reference-content");
const referenceIndex = document.getElementById("reference-index");
referenceSections.forEach((section, index) => {
  const number = String(index + 1).padStart(2, "0");
  const link = element("a", "index-link");
  link.href = `#reference/${section.id}`;
  link.append(element("span", "index-number", number), element("span", "", section.title));
  link.dataset.section = section.id;
  referenceIndex.append(link);
  const card = element("article", "reference-card");
  card.id = section.id;
  card.setAttribute("aria-labelledby", `${section.id}-title`);
  const heading = element("div", "reference-card-heading");
  const title = element("h2", "", section.title);
  title.id = `${section.id}-title`;
  heading.append(element("span", "section-number", number), title, element("span", "source-page", `стр. ${section.page}`));
  const definitions = element("dl", "definitions");
  section.terms.forEach(([term, definition]) => {
    const row = element("div", "definition-row");
    row.append(element("dt", "", term), element("dd", "", definition));
    definitions.append(row);
  });
  card.append(heading, definitions);
  referenceContent.append(card);
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => {
    const active = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if(!active) return;
    referenceIndex.querySelectorAll("a").forEach(link => {
      if(link.dataset.section === active.target.id) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }, {rootMargin:"-10% 0px -65% 0px"});
  referenceContent.querySelectorAll("article").forEach(card => observer.observe(card));
}

const quizForm = document.getElementById("quiz-form");
const answerOptions = document.getElementById("answer-options");
const questionTitle = document.getElementById("question-title");
const checkButton = document.getElementById("check-answer");
const nextButton = document.getElementById("next-question");
const retryButton = document.getElementById("retry-question");
const errorNote = document.getElementById("selection-error");
const feedbackPanel = document.querySelector(".feedback-panel");
const feedbackText = document.getElementById("feedback-text");
const feedbackImage = document.getElementById("feedback-image");
const progressTrack = document.querySelector(".progress-track");
const completeCard = document.getElementById("quiz-complete");
let questionIndex = 0;
let answered = false;
let feedbackVersion = 0;
const lastFeedbackImage = {};

function shuffledIndexes(length) {
  const indexes = Array.from({length}, (_, index) => index);
  for(let i = indexes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

async function changeImage(src, alt) {
  const version = ++feedbackVersion;
  const preload = new Image();
  preload.src = src;
  try { await preload.decode(); } catch { return; }
  if(version !== feedbackVersion) return;
  feedbackImage.src = src;
  feedbackImage.alt = alt;
  if(!reducedMotion.matches) feedbackImage.animate([{opacity:0,transform:"translateY(12px) scale(.97)",filter:"blur(4px)"},{opacity:1,transform:"translateY(0) scale(1)",filter:"blur(0)"}],{duration:500,easing:"cubic-bezier(.22,1,.36,1)"});
}

function idleFeedback() {
  feedbackPanel.dataset.status = "idle";
  feedbackText.replaceChildren(element("span", "feedback-kicker", "Твой ход"), element("h2", "", "Не торопись."), element("p", "", "Сравни формулировки и вспомни, как устроен компьютер."));
  changeImage("./assets/guide.png", "Персонаж с блокнотом ждёт твоего ответа");
}

function renderQuestion() {
  const question = quizQuestions[questionIndex];
  answered = false;
  quizForm.hidden = false;
  completeCard.hidden = true;
  quizForm.dataset.result = "";
  questionTitle.textContent = question.title;
  questionTitle.tabIndex = -1;
  answerOptions.replaceChildren();
  shuffledIndexes(question.options.length).forEach((optionIndex, displayIndex) => {
    const label = element("label", "answer-option");
    const input = element("input");
    input.type = "checkbox";
    input.name = "answer";
    input.value = String(optionIndex);
    input.id = `q${questionIndex}-option${optionIndex}`;
    const marker = element("span", "option-marker", String.fromCharCode(65 + displayIndex));
    marker.setAttribute("aria-hidden", "true");
    label.append(input, marker, element("span", "option-text", question.options[optionIndex]));
    answerOptions.append(label);
  });
  const count = quizQuestions.length;
  document.getElementById("question-counter").textContent = `Задание ${String(questionIndex + 1).padStart(2,"0")} / ${count}`;
  document.getElementById("question-topic").textContent = question.topic;
  document.getElementById("progress-fill").style.width = `${(questionIndex + 1) / count * 100}%`;
  progressTrack.setAttribute("aria-valuemax", String(count));
  progressTrack.setAttribute("aria-valuenow", String(questionIndex + 1));
  checkButton.hidden = false;
  checkButton.disabled = false;
  nextButton.hidden = true;
  nextButton.textContent = questionIndex === count - 1 ? "Завершить тест" : "Следующее задание";
  retryButton.hidden = true;
  errorNote.hidden = true;
  idleFeedback();
}

quizForm.addEventListener("submit", event => {
  event.preventDefault();
  if(answered) return;
  const selected = Array.from(answerOptions.querySelectorAll("input:checked"), input => Number(input.value));
  if(!selected.length) {
    errorNote.hidden = false;
    answerOptions.querySelector("input").focus();
    return;
  }
  errorNote.hidden = true;
  answered = true;
  const question = quizQuestions[questionIndex];
  const isCorrect = selected.length === question.correct.length && selected.every(value => question.correct.includes(value));
  const status = isCorrect ? "correct" : "incorrect";
  quizForm.dataset.result = status;
  feedbackPanel.dataset.status = status;
  answerOptions.querySelectorAll("input").forEach(input => {input.disabled = true;});
  checkButton.hidden = true;
  nextButton.hidden = false;
  retryButton.hidden = isCorrect;
  const candidates = feedbackImages[status].filter(src => src !== lastFeedbackImage[status]);
  const src = candidates[Math.floor(Math.random() * candidates.length)];
  lastFeedbackImage[status] = src;
  changeImage(src, isCorrect ? "Радостный персонаж: ответ верный" : "Огорчённый персонаж: в ответе есть ошибка");
  const referenceLink = element("a", "feedback-reference", `Повторить тему · стр. ${question.page} ↗`);
  referenceLink.href = `#reference/${question.reference}`;
  feedbackText.replaceChildren(element("span", "feedback-kicker", isCorrect ? "Всё верно" : "Есть ошибка"), element("h2", "", isCorrect ? "Отлично разобрался!" : "Посмотри внимательнее."), element("p", "", question.explanation), referenceLink);
  if(!reducedMotion.matches) feedbackText.animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"translateY(0)"}],{duration:350,easing:"ease-out"});
  nextButton.focus({preventScroll:true});
  if(window.innerWidth <= 800) feedbackPanel.scrollIntoView({behavior:reducedMotion.matches ? "instant" : "smooth",block:"start"});
});

answerOptions.addEventListener("change", () => {errorNote.hidden = true;});
retryButton.addEventListener("click", () => {
  answered = false;
  quizForm.dataset.result = "";
  answerOptions.querySelectorAll("input").forEach(input => {input.disabled = false;});
  checkButton.hidden = false;
  nextButton.hidden = true;
  retryButton.hidden = true;
  idleFeedback();
  answerOptions.querySelector("input").focus({preventScroll:true});
});
nextButton.addEventListener("click", () => {
  if(!answered) return;
  if(questionIndex === quizQuestions.length - 1) {
    quizForm.hidden = true;
    completeCard.hidden = false;
    document.getElementById("question-topic").textContent = "Готово";
    feedbackPanel.dataset.status = "idle";
    feedbackText.replaceChildren(element("span", "feedback-kicker", "До новой встречи"), element("h2", "", "Теперь всё по полочкам."), element("p", "", "Если хочется закрепить материал, повтори определения и пройди задания ещё раз."));
    changeImage("./assets/guide.png", "Персонаж с блокнотом: практика завершена");
    completeCard.querySelector("h2").focus({preventScroll:true});
  } else {
    questionIndex++;
    renderQuestion();
    questionTitle.focus({preventScroll:true});
  }
  document.querySelector(".quiz-workspace").scrollIntoView({behavior:reducedMotion.matches ? "instant" : "smooth",block:"start"});
  if(!reducedMotion.matches) document.querySelector(".quiz-workspace").animate([{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"translateY(0)"}],{duration:400,easing:"ease-out"});
});
document.getElementById("restart-quiz").addEventListener("click", () => {
  questionIndex = 0;
  renderQuestion();
  questionTitle.focus({preventScroll:true});
});
document.querySelector(".nav-count").textContent = String(quizQuestions.length);
renderQuestion();
navigate();
