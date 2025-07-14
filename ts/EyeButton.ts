export class EyeButton {
	hidden = false;
	onChange: any;

	constructor() {}

	static getEyeButton() {
		const eyeButtons = document.querySelectorAll(".pi-eye,.pi-eye-slash");
		if (eyeButtons.length > 1) {
			console.log("found too many eye buttons", eyeButtons); // eslint-disable-line no-console
		}
		return eyeButtons[0];
	}

	check() {
		const eyeButton = EyeButton.getEyeButton();
		if (!eyeButton) {
			return;
		}
		const hidden = eyeButton.classList.contains("pi-eye-slash");
		if (this.hidden !== hidden) {
			this.hidden = hidden;
			if (this.onChange) {
				this.onChange(hidden);
			}
		}
	}

	listenEyeButton(onChange) {
		this.onChange = onChange;
		const eyeButton = EyeButton.getEyeButton();
		if (!eyeButton) {
			setTimeout(() => this.listenEyeButton(onChange), 1000);
			return;
		}
		const eyeDom = eyeButton.parentNode;
		if (!eyeDom) {
			console.warn("Eye button parent node not found"); // eslint-disable-line no-console
			return;
		}
		eyeDom.addEventListener("click", () => this.check());
		eyeDom.addEventListener("keyup", () => this.check());
		eyeDom.addEventListener("mouseup", () => this.check());
	}
}
