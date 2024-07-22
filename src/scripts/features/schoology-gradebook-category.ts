import { EXTENSION_NAME } from "../utils/constants";
import { conditionalClass, createElement, getTextNodeContent } from "../utils/dom";
import { numbersNearlyMatch } from "../utils/math";
import { SchoologyAssignment } from "./schoology-assignment";
import { SchoologyGradebookPeriod } from "./schoology-gradebook-period";
import { enableWhatIfGrades, whatIfGradesEnabled } from "./what-if-grades";

export class SchoologyGradebookCategory {
    public assignments: SchoologyAssignment[] = [];
    public id: string;
    public name: string;
    public weight?: number;

    constructor(public period: SchoologyGradebookPeriod, public element: HTMLElement) {
        this.element.classList.add("splus-grades-category");

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
    private _elem_gradingMethodIndicator: HTMLElement | null = null;
    private _elem_gradeColumnRight: HTMLElement | null = null;
    private _elem_letterGrade: HTMLElement | null = null;
    private _elem_gradeModifiedIndicator: HTMLElement | null = null;

    private sgyAwardedGrade: string | null = null;
    private sgyAwardedGradeValue: number | null = null;

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

        this._elem_gradingMethodIndicator = createElement(
            "span",
            ["splus-grades-method-indicator"],
            { textContent: "Σ", onclick: this.toggleGradingMode.bind(this) }
        );
        this._elem_awardedGrade.after(this._elem_gradingMethodIndicator);

        this.sgyAwardedGrade = this._elem_awardedGrade.textContent!;
        if (this.sgyAwardedGrade) {
            let gradeMatch = this.sgyAwardedGrade.match(/[\d\.]+/);
            this.sgyAwardedGradeValue = gradeMatch ? Number.parseFloat(gradeMatch[0]) : null;
        }
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

        this.initAddAssignmentButton();
    }

    private initAddAssignmentButton() {
        let lastRow = this.course.element.querySelector(
            `.last-row-of-tier[data-parent-id="${this.id}"]`
        );
        lastRow?.classList.remove("last-row-of-tier");

        let addAssignmentThing = createElement("tr", [
            "report-row",
            "item-row",
            "last-row-of-tier",
            "splus-grades-add-assignment",
        ]);
        addAssignmentThing.dataset.parentId = this.id;
        // to avoid a hugely annoying DOM construction
        // edit indicator will be added later
        // FIXME add little plus icon
        addAssignmentThing.innerHTML =
            '<th scope="row" class="title-column clickable"><div class="reportSpacer-3"><div class="td-content-wrapper"><span class="title"><a class="sExtlink-processed">+ Add "What-If?" Assignment</a></span></div></div></th><td class="grade-column"><div class="td-content-wrapper"><span class="no-grade"></span><div class="grade-wrapper"></div></div></td><td class="comment-column"><div class="td-content-wrapper"><span class="visually-hidden">No comment</span></div></td><td class="accomodation-received-column"><div class="td-content-wrapper"></div></td>';
        addAssignmentThing
            .getElementsByClassName("title")[0]
            .firstElementChild?.addEventListener("click", this.addAssignment);

        if (!this.element.classList.contains("has-children")) {
            this.element.classList.add("has-children");

            let categoryArrow = createElement(
                "img",
                ["expandable-icon-grading-report", "splus-grades-empty-category-expand-icon"],
                {
                    src: "/sites/all/themes/schoology_theme/images/expandable-sprite.png",
                }
            );
            this.element.querySelector("th .td-content-wrapper")?.prepend(categoryArrow);
            this.element.classList.add("childrenCollapsed");
        }

        if (
            lastRow?.classList.contains("hidden") ||
            this.element.classList.contains("childrenCollapsed")
        ) {
            addAssignmentThing.classList.add("hidden");
        }

        (lastRow || this.element).insertAdjacentElement("afterend", addAssignmentThing);
    }

    public async render(whatIf: boolean = false) {
        conditionalClass(this.element, this.isLoading, "splus-grades-loading");
        conditionalClass(this.element, this.failedToLoad, "splus-grades-failed");
        conditionalClass(this.element, this.isLoading || this.failedToLoad, "splus-grades-issue");
        conditionalClass(this.element, this.isModified, "splus-grades-modified");
        conditionalClass(
            this.element,
            !this.weight && this.period.categoriesAreWeighted,
            "splus-grades-ignored"
        );
        conditionalClass(
            this.element,
            this.assumedGradingMethod === "no-data",
            "splus-grades-method-no-data"
        );
        conditionalClass(
            this.element,
            this.assumedGradingMethod === "no-match",
            "splus-grades-method-no-match"
        );
        conditionalClass(
            this.element,
            this.assumedGradingMethod === "percent",
            "splus-grades-method-percent"
        );
        conditionalClass(
            this.element,
            this.assumedGradingMethod === "points",
            "splus-grades-method-points"
        );
        conditionalClass(
            this.element,
            this.getAssignmentsWeightedEqually(whatIf),
            "splus-grades-assignments-weighted-equally"
        );
        conditionalClass(
            this.element,
            whatIf && this._whatIfGradingModeToggled,
            "splus-grades-what-if-grading-mode-toggled"
        );

        if (!this.isLoading) {
            this._elem_totalPoints!.textContent = this.getPoints(whatIf).toString();
            this._elem_maxPoints!.textContent = ` / ${this.getMaxPoints(whatIf)}`;

            this._elem_gradingMethodIndicator!.textContent = this.getAssignmentsWeightedEqually(
                whatIf
            )
                ? "%"
                : "Σ";
            this._elem_gradingMethodIndicator!.title = this.getAssignmentsWeightedEqually(whatIf)
                ? "Category score is determined by treating all assignments as graded out of 100 points (weighted equally)."
                : "Category score is determined by the total number of points of all assignments.";

            if (this.getAssignmentsWeightedEqually(whatIf) && !this._whatIfGradingModeToggled) {
                this._elem_gradingMethodIndicator!.title +=
                    "\nSchoology Plus assumed this grading mode is correct based on Schoology's recorded grade for this category.";
            }

            if (!this.getAssignmentsWeightedEqually(whatIf) && !this._whatIfGradingModeToggled) {
                this._elem_gradingMethodIndicator!.title += "This is the default grading mode.";
            }

            if (whatIf) {
                this._elem_gradingMethodIndicator!.title +=
                    "\n\nClick to toggle grading method for this category for What-If Grades.";
                this._elem_letterGrade!.textContent = this.getLetterGradeString(whatIf);
                this._elem_letterGrade!.title = this.course.gradingScaleCalculationNotice;
            } else {
                this._elem_letterGrade!.textContent = this.sgyAwardedGrade;
                this._elem_letterGrade!.title = `S+ calculated this grade as ${this.getLetterGradeString(
                    whatIf
                )}\n${this.course.gradingScaleCalculationNotice}`;
            }
        }

        this.period.render(whatIf);
    }

    private toggleGradingMode() {
        let whatIf = whatIfGradesEnabled();
        if (!whatIf) return;

        this._whatIfGradingModeToggled = !this._whatIfGradingModeToggled;

        this.render(whatIf);
    }

    public addAssignment() {
        if (!whatIfGradesEnabled()) {
            if (
                !confirm(
                    'What-If Grades must be enabled to add a "What-If" assignment. Would you like to enable What-If Grades?'
                )
            ) {
                return;
            }

            enableWhatIfGrades();
        }
    }

    public get isLoading() {
        return this.assignments.some(assignment => assignment.isLoading);
    }

    public get failedToLoad() {
        return this.assignments.some(assignment => assignment.failedToLoad);
    }

    public get isModified() {
        return (
            this._whatIfGradingModeToggled ||
            this.assignments.some(assignment => assignment.isModified)
        );
    }

    private _whatIfGradingModeToggled = false;

    public getAssignmentsWeightedEqually(whatIf: boolean = false) {
        let assumedMethod = this.assumedGradingMethod === "percent";
        if (!whatIf) return assumedMethod;
        return this._whatIfGradingModeToggled ? !assumedMethod : assumedMethod;
    }

    public get assumedGradingMethod() {
        if (this.sgyAwardedGradeValue === null) return "no-data";

        let percentNormal = (this.getPointsNormal() * 100) / this.getMaxPointsNormal();
        let percentEqual = (this.getPointsEqualWeights() * 100) / this.getMaxPointsEqualWeights();

        // if percentNormal within 0.1% of schoology's calculation, assume normal
        if (numbersNearlyMatch(percentNormal, this.sgyAwardedGradeValue, 0.1)) return "points";

        // if percentEqual within 0.1% of schoology's calculation, assume equal
        if (numbersNearlyMatch(percentEqual, this.sgyAwardedGradeValue, 0.1)) return "percent";

        // if neither are close to schoology's calculation, assume normal
        return "no-match";
    }

    private getPointsEqualWeights(whatIf: boolean = false) {
        return this.assignments.reduce((acc, assignment) => {
            if (assignment.getIgnoreInCalculations(whatIf)) return acc;
            // weird behavior from sgy: if max points is 0, treat extra credit as points as if all assignments are worth 100 points
            if (assignment.getMaxPoints(whatIf) === 0)
                return acc + (assignment.getPoints(whatIf) ?? 0) * assignment.sgyGradeFactor;
            return acc + (assignment.getGradePercent(whatIf) ?? 0) * assignment.sgyGradeFactor;
        }, 0);
    }

    private getMaxPointsEqualWeights(whatIf: boolean = false) {
        return this.assignments.reduce((acc, assignment) => {
            if (assignment.getIgnoreInCalculations(whatIf)) return acc;
            if (assignment.getMaxPoints(whatIf) === 0) return acc;
            return acc + 100 * assignment.sgyGradeFactor;
        }, 0);
    }

    private getPointsNormal(whatIf: boolean = false) {
        return this.assignments.reduce((acc, assignment) => {
            if (assignment.getIgnoreInCalculations(whatIf)) return acc;
            return acc + (assignment.getPoints(whatIf) ?? 0) * assignment.sgyGradeFactor;
        }, 0);
    }

    private getMaxPointsNormal(whatIf: boolean = false) {
        return this.assignments.reduce((acc, assignment) => {
            if (assignment.getIgnoreInCalculations(whatIf)) return acc;
            return acc + (assignment.getMaxPoints(whatIf) ?? 0) * assignment.sgyGradeFactor;
        }, 0);
    }

    public getPoints(whatIf: boolean = false) {
        return this.getAssignmentsWeightedEqually(whatIf)
            ? this.getPointsEqualWeights(whatIf)
            : this.getPointsNormal(whatIf);
    }

    public getMaxPoints(whatIf: boolean = false) {
        return this.getAssignmentsWeightedEqually(whatIf)
            ? this.getMaxPointsEqualWeights(whatIf)
            : this.getMaxPointsNormal(whatIf);
    }

    public getGradePercent(whatIf: boolean = false) {
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
        if (gradePercent === Number.POSITIVE_INFINITY)
            return `${this.getPoints(whatIf)} points of Extra Credit`;
        return `${gradePercent}%`;
    }

    public toString(whatIf: boolean = false) {
        return `${this.name} (${this.id}) - ${this.getPoints(whatIf)}/${this.getMaxPoints(
            whatIf
        )} - ${this.getGradePercentageString(whatIf)}`;
    }
}
