
document.addEventListener("DOMContentLoaded", () => {
  const menuButtons = document.querySelectorAll(".menu-card");

  menuButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;

      if (!page) {
        return;
      }

      alert(`${page} の機能は、これから作成します！`);
    });
  });

  console.log("全国都市対抗選手権大会システム 起動！");
});
