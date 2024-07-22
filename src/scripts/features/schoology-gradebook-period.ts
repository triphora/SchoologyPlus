import { EXTENSION_NAME } from "../utils/constants";
import { conditionalClass, createElement, getTextNodeContent } from "../utils/dom";
import { SchoologyCourse } from "./schoology-course";
import { SchoologyGradebookCategory } from "./schoology-gradebook-category";

export class SchoologyGradebookPeriod {
    public categories: SchoologyGradebookCategory[] = [];
    public id: string;
    public name: string;
    public weight: number;

    constructor(public course: SchoologyCourse, public element: HTMLElement) {
        this.element.classList.add("splus-grades-period");

        this.id = this.element.dataset.id!;
        this.name = getTextNodeContent(
            this.element.querySelector<HTMLAnchorElement>(".title-column .title")!
        );
        this.weight =
            Number.parseFloat(
                this.element
                    .querySelector(".title-column .percentage-contrib")!
                    .textContent!.match(/\d+/)![0]
            ) / 100;
    }

    public load() {
        let categoryElements = Array.from(
            this.course.gradebookTable.querySelectorAll<HTMLTableRowElement>("tr.category-row")
        ).filter(categoryElement => categoryElement.dataset.parentId === this.id);

        this.initElements();

        for (let categoryElement of categoryElements) {
            let category = new SchoologyGradebookCategory(this, categoryElement);
            this.categories.push(category);
            category.load();
        }

        this.render();
    }

    private _elem_gradeColumnCenter: HTMLElement | null = null;
    private _elem_awardedGrade: HTMLElement | null = null;
    private _elem_totalPoints: HTMLElement | null = null;
    private _elem_maxPoints: HTMLElement | null = null;
    private _elem_gradeColumnRight: HTMLElement | null = null;
    private _elem_letterGrade: HTMLElement | null = null;
    private _elem_gradeModifiedIndicator: HTMLElement | null = null;

    private sgyAwardedGrade: string | null = null;

    private initElements() {
        this._elem_gradeColumnCenter = this.element.querySelector(
            ".grade-column .td-content-wrapper"
        )!;
        this._elem_gradeColumnCenter.classList.add("grade-column-center");
        this._elem_awardedGrade = this._elem_gradeColumnCenter.querySelector(".awarded-grade");

        if (!this._elem_awardedGrade) {
            this._elem_awardedGrade = this._elem_gradeColumnCenter.querySelector(".no-grade")!;
            this._elem_awardedGrade.classList.add("awarded-grade");
            this._elem_awardedGrade.classList.remove("no-grade");
        }

        this.sgyAwardedGrade = this._elem_awardedGrade.textContent!;
        this._elem_awardedGrade.innerHTML = "";

        this._elem_totalPoints = createElement("span", ["rounded-grade"], { textContent: "—" });
        this._elem_maxPoints = createElement("span", ["max-grade"], { textContent: " / —" });

        this._elem_awardedGrade.append(this._elem_totalPoints, this._elem_maxPoints);

        this._elem_gradeColumnRight = this.element.querySelector(".comment-column")!;
        this._elem_gradeColumnRight.classList.add("grade-column", "grade-column-right");
        this._elem_gradeColumnRight.classList.remove("comment-column");

        let letterGradeParent = this._elem_gradeColumnRight.querySelector(".td-content-wrapper")!;
        this._elem_letterGrade = createElement("span", ["splus-grades-letter-grade-text"], {
            textContent: this.sgyAwardedGrade,
        });
        letterGradeParent.appendChild(this._elem_letterGrade);

        this._elem_gradeModifiedIndicator = createElement(
            "span",
            ["splus-grades-modified-indicator"],
            { textContent: "!" }
        );

        this._elem_letterGrade.after(this._elem_gradeModifiedIndicator);
    }

    public async render(whatIf: boolean = false) {
        conditionalClass(this.element, this.isLoading, "splus-grades-loading");
        conditionalClass(this.element, this.failedToLoad, "splus-grades-failed");
        conditionalClass(this.element, this.isLoading || this.failedToLoad, "splus-grades-issue");
        conditionalClass(this.element, this.isModified, "splus-grades-modified");
        conditionalClass(this.element, this.weight === 0, "splus-grades-ignored");

        if (!this.isLoading) {
            if (!this.categoriesAreWeighted) {
                this._elem_totalPoints!.textContent = this.getPoints(whatIf).toString();
                this._elem_maxPoints!.textContent = ` / ${this.getMaxPoints(whatIf)}`;
            } else {
                this._elem_totalPoints!.textContent = "";
                this._elem_maxPoints!.textContent = "";
            }

            if (whatIf) {
                this._elem_letterGrade!.textContent = this.getLetterGradeString(whatIf);
                this._elem_letterGrade!.title = this.course.gradingScaleCalculationNotice;
            } else {
                this._elem_letterGrade!.textContent = this.sgyAwardedGrade;
                this._elem_letterGrade!.title = `S+ calculated this grade as ${this.getLetterGradeString(
                    whatIf
                )}\n${this.course.gradingScaleCalculationNotice}`;
            }
        }

        this.course.render(whatIf);
    }

    public get categoriesAreWeighted() {
        return this.categories.some(category => category.weight !== undefined);
    }

    public get isLoading() {
        return this.categories.some(category => category.isLoading);
    }

    public get failedToLoad() {
        return this.categories.some(category => category.failedToLoad);
    }

    public get isModified() {
        return this.categories.some(category => category.isModified);
    }

    public getPoints(whatIf: boolean = false): number {
        if (this.categoriesAreWeighted) return this.getGradePercent(whatIf) ?? 0;

        return this.categories.reduce((acc, category) => {
            if (category.weight === undefined) return acc + category.getPoints(whatIf);

            return acc + category.getPoints(whatIf) * category.weight;
        }, 0);
    }

    public getMaxPoints(whatIf: boolean = false) {
        if (this.categoriesAreWeighted) return 100;

        return this.categories.reduce((acc, category) => {
            if (category.weight === undefined) return acc + category.getMaxPoints(whatIf);

            return acc + category.getMaxPoints(whatIf) * category.weight;
        }, 0);
    }

    public getGradePercent(whatIf: boolean = false) {
        if (this.categoriesAreWeighted) {
            let gradePercent = this.categories.reduce((acc, category) => {
                if (category.weight === undefined) return acc;

                return acc + (category.getGradePercent(whatIf) ?? 0) * category.weight;
            }, 0);

            return gradePercent;
        }

        let points = this.getPoints(whatIf);
        let maxPoints = this.getMaxPoints(whatIf);

        if (maxPoints === 0 && points === 0) return undefined;
        if (maxPoints === 0) return Number.POSITIVE_INFINITY;
        if (points === 0) return 0;

        return (points * 100) / maxPoints;
    }

    public getLetterGradeString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (gradePercent === undefined) return "—";
        let letterGrade = this.course.getLetterGrade(gradePercent);
        return letterGrade === null
            ? this.getGradePercentageString(whatIf)
            : `${letterGrade} (${this.getGradePercentageString(whatIf)})`;
    }

    public getGradePercentageString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (!this.isModified && this.isLoading) return "LOADING";
        if (!this.isModified && this.failedToLoad) return "ERR";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(gradePercent * 100) / 100}%`;
    }

    public getGradePercentageDetailsString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (!this.isModified && this.isLoading) return "Loading grade percentage...";
        if (!this.isModified && this.failedToLoad) return "Failed to load grade percentage";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY) return "Extra Credit";
        return `${gradePercent}%`;
    }

    public toString(whatIf: boolean = false) {
        return `${this.name} (${this.id}) - ${this.getPoints(whatIf)}/${this.getMaxPoints(
            whatIf
        )} - ${this.getGradePercentageString(whatIf)}`;
    }
}
