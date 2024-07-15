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

    public async render() {
        conditionalClass(this.element, this.isLoading, "splus-grades-loading");
        conditionalClass(this.element, this.failedToLoad, "splus-grades-failed");
        conditionalClass(this.element, this.isLoading || this.failedToLoad, "splus-grades-issue");
        conditionalClass(this.element, this.isModified, "splus-grades-modified");

        if (!this.isLoading) {
            if (!this.categoriesAreWeighted) {
                this._elem_totalPoints!.textContent = this.points.toString();
                this._elem_maxPoints!.textContent = ` / ${this.maxPoints}`;
            } else {
                this._elem_totalPoints!.textContent = "";
                this._elem_maxPoints!.textContent = "";
            }

            this._elem_letterGrade!.textContent = this.schoologyAwardedGrade;
            this._elem_letterGrade!.title = `S+ calculated this grade as ${this.letterGradeString}\nLetter grade calculated by ${EXTENSION_NAME} using the following grading scale:\n${this.course.gradingScaleString}\nTo change this grading scale, find 'Course Options' on the page for this course`;
        }

        this.course.render();
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

    public get points(): number {
        if (this.categoriesAreWeighted) return this.gradePercent ?? 0;

        return this.categories.reduce((acc, category) => {
            if (category.weight === undefined) return acc + category.points;

            return acc + category.points * category.weight;
        }, 0);
    }

    public get maxPoints() {
        if (this.categoriesAreWeighted) return 100;

        return this.categories.reduce((acc, category) => {
            if (category.weight === undefined) return acc + category.maxPoints;

            return acc + category.maxPoints * category.weight;
        }, 0);
    }

    public get whatIfPoints(): number {
        if (this.categoriesAreWeighted) return this.whatIfGradePercent ?? 0;

        return this.categories.reduce((acc, category) => {
            if (category.weight === undefined) return acc + category.whatIfPoints;

            return acc + category.whatIfPoints * category.weight;
        }, 0);
    }

    public get whatIfMaxPoints() {
        if (this.categoriesAreWeighted) return 100;

        return this.categories.reduce((acc, category) => {
            if (category.weight === undefined) return acc + category.whatIfMaxPoints;

            return acc + category.whatIfMaxPoints * category.weight;
        }, 0);
    }

    public get gradePercent() {
        return this.calculateGradePercent(false);
    }

    public get whatIfGradePercent() {
        return this.calculateGradePercent(true);
    }

    private calculateGradePercent(whatIf: boolean) {
        if (this.categoriesAreWeighted) {
            let weightedPoints = this.categories.reduce((acc, category) => {
                if (category.weight === undefined) return acc;

                return acc + (whatIf ? category.whatIfPoints : category.points) * category.weight;
            }, 0);

            let weightedMaxPoints = this.categories.reduce((acc, category) => {
                if (category.weight === undefined) return acc;

                return (
                    acc + (whatIf ? category.whatIfMaxPoints : category.maxPoints) * category.weight
                );
            }, 0);

            if (weightedPoints === 0 && weightedMaxPoints === 0) return undefined;
            if (weightedMaxPoints === 0) return Number.POSITIVE_INFINITY;
            if (weightedPoints === 0) return 0;

            return (weightedPoints * 100) / weightedMaxPoints;
        }
        if (whatIf) {
            if (this.whatIfMaxPoints === 0 && this.whatIfPoints === 0) return undefined;
            if (this.whatIfMaxPoints === 0) return Number.POSITIVE_INFINITY;
            if (this.whatIfPoints === 0) return 0;

            return (this.whatIfPoints * 100) / this.whatIfMaxPoints;
        }
        if (this.maxPoints === 0 && this.points === 0) return undefined;
        if (this.maxPoints === 0) return Number.POSITIVE_INFINITY;
        if (this.points === 0) return 0;

        return (this.points * 100) / this.maxPoints;
    }

    public get letterGradeString() {
        if (!this.gradePercent) return "—";
        let letterGrade = this.course.getLetterGrade(this.gradePercent);
        return `${letterGrade} (${this.gradePercentageString})`;
    }

    public get gradePercentageString() {
        if (this.isLoading) return "LOADING";
        if (this.failedToLoad) return "ERR";
        if (this.gradePercent === undefined) return "—";
        if (this.gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(this.gradePercent * 100) / 100}%`;
    }

    public get gradePercentageDetailsString() {
        if (this.isLoading) return "Loading grade percentage...";
        if (this.failedToLoad) return "Failed to load grade percentage";
        if (this.gradePercent === undefined) return "—";
        if (this.gradePercent === Number.POSITIVE_INFINITY) return "Extra Credit";
        return `${this.gradePercent}%`;
    }

    public toString() {
        return `${this.name} (${this.id}) - ${this.points}/${this.maxPoints} - ${this.gradePercentageString}`;
    }
}
