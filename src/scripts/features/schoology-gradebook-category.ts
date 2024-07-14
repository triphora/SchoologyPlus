import { EXTENSION_NAME } from "../utils/constants";
import { createElement, getTextNodeContent } from "../utils/dom";
import { SchoologyAssignment } from "./schoology-assignment";
import { SchoologyGradebookPeriod } from "./schoology-gradebook-period";

export class SchoologyGradebookCategory {
    public assignments: SchoologyAssignment[] = [];
    public id: string;
    public name: string;
    public weight?: number;

    constructor(public period: SchoologyGradebookPeriod, public element: HTMLElement) {
        this.id = this.element.dataset.id!;
        this.name = getTextNodeContent(
            this.element.querySelector<HTMLAnchorElement>(".title-column .title")!
        );

        let weightedElement = this.element.querySelector(".title-column .percentage-contrib");

        if (weightedElement) {
            this.weight = Number.parseFloat(weightedElement.textContent!.match(/\d+/)![0]) / 100;
        }
    }

    public get course() {
        return this.period.course;
    }

    public load() {
        let assignmentElements = Array.from(
            this.course.gradebookTable.querySelectorAll<HTMLTableRowElement>("tr.item-row")
        ).filter(assignmentElement => assignmentElement.dataset.parentId === this.id);

        this.initElements();

        for (let assignmentElement of assignmentElements) {
            let assignment = new SchoologyAssignment(this, assignmentElement);
            this.assignments.push(assignment);
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
        if (!this.isLoading) {
            this._elem_totalPoints!.textContent = this.points.toString();
            this._elem_maxPoints!.textContent = ` / ${this.maxPoints}`;

            this._elem_letterGrade!.textContent = this.schoologyAwardedGrade;
            this._elem_letterGrade!.title = `S+ calculated this grade as ${this.course.getLetterGrade(
                this.gradePercent!
            )} (${
                this.gradePercentageDetailsString
            })\nLetter grade calculated by ${EXTENSION_NAME} using the following grading scale:\n${
                this.course.gradingScaleString
            }\nTo change this grading scale, find 'Course Options' on the page for this course`;
        }

        this.period.render();
    }

    public get isLoading() {
        return this.assignments.some(assignment => assignment.isLoading);
    }

    public get failedToLoad() {
        return this.assignments.some(assignment => assignment.failedToLoad);
    }

    public get points() {
        return this.assignments.reduce((acc, assignment) => {
            if (assignment.ignoreInCalculations) return acc;

            return acc + (assignment.points ?? 0);
        }, 0);
    }

    public get maxPoints() {
        return this.assignments.reduce((acc, assignment) => {
            if (assignment.ignoreInCalculations) return acc;

            return acc + (assignment.maxPoints ?? 0);
        }, 0);
    }

    public get gradePercent() {
        if (this.maxPoints === 0 && this.points === 0) return undefined;
        if (this.maxPoints === 0) return Number.POSITIVE_INFINITY;
        if (this.points === 0) return 0;

        return (this.points * 100) / this.maxPoints;
    }

    public get gradePercentageString() {
        if (this.isLoading) return "LOADING";
        if (this.failedToLoad) return "ERR";
        if (this.gradePercent === undefined) return "—";
        if (this.gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(this.gradePercent)}%`;
    }

    public get gradePercentageDetailsString() {
        if (this.isLoading) return "Loading grade percentage...";
        if (this.failedToLoad) return "Failed to load grade percentage";
        if (this.gradePercent === undefined) return undefined;
        if (this.gradePercent === Number.POSITIVE_INFINITY)
            return `${this.points} points of Extra Credit`;
        return `${this.gradePercent.toFixed(2)}%`;
    }

    public toString() {
        return `${this.name} (${this.id}) - ${this.points}/${this.maxPoints} - ${this.gradePercentageString}`;
    }
}
