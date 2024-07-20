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

    private schoologyAwardedGrade: string | null = null;

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

        this.schoologyAwardedGrade = this._elem_awardedGrade.textContent!;
        this._elem_awardedGrade.innerHTML = "";

        this._elem_totalPoints = createElement("span", ["rounded-grade"], { textContent: "—" });
        this._elem_maxPoints = createElement("span", ["max-grade"], { textContent: " / —" });

        this._elem_awardedGrade.append(this._elem_totalPoints, this._elem_maxPoints);

        this._elem_gradeColumnRight = this.element.querySelector(".comment-column")!;
        this._elem_gradeColumnRight.classList.add("grade-column", "grade-column-right");
        this._elem_gradeColumnRight.classList.remove("comment-column");

        this._elem_letterGrade = this._elem_gradeColumnRight.querySelector(".td-content-wrapper")!;
        this._elem_letterGrade.textContent = this.schoologyAwardedGrade;
    }

    public async render(whatIf: boolean = false) {
        conditionalClass(this.element, this.isLoading, "splus-grades-loading");
        conditionalClass(this.element, this.failedToLoad, "splus-grades-failed");
        conditionalClass(this.element, this.isLoading || this.failedToLoad, "splus-grades-issue");
        conditionalClass(this.element, this.isModified, "splus-grades-modified");

        if (!this.isLoading) {
            if (!this.categoriesAreWeighted) {
                this._elem_totalPoints!.textContent = this.getPoints(whatIf).toString();
                this._elem_maxPoints!.textContent = ` / ${this.getMaxPoints(whatIf)}`;
            } else {
                this._elem_totalPoints!.textContent = "";
                this._elem_maxPoints!.textContent = "";
            }

            this._elem_letterGrade!.textContent = this.schoologyAwardedGrade;
            this._elem_letterGrade!.title = `S+ calculated this grade as ${this.getLetterGradeString(
                whatIf
            )}\nLetter grade calculated by ${EXTENSION_NAME} using the following grading scale:\n${
                this.course.gradingScaleString
            }\nTo change this grading scale, find 'Course Options' on the page for this course`;
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
            let weightedPoints = this.categories.reduce((acc, category) => {
                if (category.weight === undefined) return acc;

                return acc + category.getPoints(whatIf) * category.weight;
            }, 0);

            let weightedMaxPoints = this.categories.reduce((acc, category) => {
                if (category.weight === undefined) return acc;

                return acc + category.getMaxPoints(whatIf) * category.weight;
            }, 0);

            if (weightedPoints === 0 && weightedMaxPoints === 0) return undefined;
            if (weightedMaxPoints === 0) return Number.POSITIVE_INFINITY;
            if (weightedPoints === 0) return 0;

            return (weightedPoints * 100) / weightedMaxPoints;
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
        return `${letterGrade} (${this.getGradePercentageString(whatIf)})`;
    }

    public getGradePercentageString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (this.isLoading) return "LOADING";
        if (this.failedToLoad) return "ERR";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(gradePercent * 100) / 100}%`;
    }

    public getGradePercentageDetailsString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (this.isLoading) return "Loading grade percentage...";
        if (this.failedToLoad) return "Failed to load grade percentage";
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