const QUESTS = ["follow", "like", "retweet", "telegram"];

const state = {
  sessionId: null,
  completed: [],
  opened: {}
};

const loader = document.querySelector("#loader");
const completedCount = document.querySelector("#completedCount");
const progressBar = document.querySelector("#progressBar");
const form = document.querySelector("#walletForm");
const walletInput = document.querySelector("#wallet");
const formButton = form.querySelector("button");
const formMessage = document.querySelector("#formMessage");

window.addEventListener("load", () => {
  setTimeout(() => loader.classList.add("is-hidden"), 1400);
});

async function api(path, payload) {
  const options = payload
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    : undefined;

  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

function updateUi() {
  const completedTotal = state.completed.length;
  completedCount.textContent = completedTotal;
  progressBar.style.width = `${(completedTotal / QUESTS.length) * 100}%`;

  QUESTS.forEach((quest, index) => {
    const card = document.querySelector(`[data-quest="${quest}"].quest`);
    const button = document.querySelector(`button[data-quest="${quest}"]`);
    const link = card.querySelector(".quest-link");
    const isDone = state.completed.includes(quest);
    const isUnlocked = index === 0 || state.completed.includes(QUESTS[index - 1]);
    const hasOpenedQuest = Boolean(state.opened[quest]);

    card.classList.toggle("done", isDone);
    card.classList.toggle("active", isUnlocked && !isDone);
    card.classList.toggle("locked", !isUnlocked);

    link.classList.toggle("disabled", !isUnlocked || isDone);
    link.setAttribute("aria-disabled", String(!isUnlocked || isDone));
    link.tabIndex = !isUnlocked || isDone ? -1 : 0;

    button.disabled = !isUnlocked || isDone || !hasOpenedQuest;
    button.textContent = isDone ? "Complete" : "Done";
  });

  const allDone = completedTotal === QUESTS.length;
  form.classList.toggle("locked", !allDone);
  walletInput.disabled = !allDone;
  formButton.disabled = !allDone;

  if (allDone && !formMessage.classList.contains("success")) {
    formMessage.textContent = "All quests complete. Add your wallet and the backend will collect it.";
    formMessage.className = "form-message";
  }
}

async function startSession() {
  const data = await api("/api/session");
  state.sessionId = data.sessionId;
  state.completed = data.completed || [];
  updateUi();
}

document.querySelectorAll("[data-action='verify']").forEach(button => {
  button.addEventListener("click", async () => {
    const quest = button.dataset.quest;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const data = await api("/api/verify", {
        sessionId: state.sessionId,
        quest,
        completed: state.completed
      });
      state.sessionId = data.sessionId;
      state.completed = data.completed;
      updateUi();
    } catch (error) {
      button.textContent = original;
      formMessage.textContent = error.message;
      formMessage.className = "form-message error";
      updateUi();
    }
  });
});

document.querySelectorAll(".quest-link").forEach(link => {
  link.addEventListener("click", event => {
    const card = link.closest(".quest");
    if (!card) return;

    if (card.classList.contains("locked") || card.classList.contains("done")) {
      event.preventDefault();
      return;
    }

    const quest = card.dataset.quest;
    state.opened[quest] = true;
    updateUi();
  });
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  formButton.disabled = true;
  formButton.textContent = "Collecting...";
  formMessage.className = "form-message";
  formMessage.textContent = "Saving your wallet to the backend...";

  try {
    const data = await api("/api/waitlist", {
      sessionId: state.sessionId,
      completed: state.completed,
      wallet: walletInput.value
    });
    formMessage.textContent = data.message;
    formMessage.className = "form-message success";
    walletInput.value = "";
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.className = "form-message error";
  } finally {
    formButton.disabled = false;
    formButton.textContent = "Send wallet";
  }
});

startSession().catch(error => {
  formMessage.textContent = error.message;
  formMessage.className = "form-message error";
});