import { Logger } from "../utils/logger";
import { SchoologyCourse } from "./schoology-course";

export function loadWhatIfGrades() {
    let courses = loadCourses();
    Logger.log("Loaded courses:", courses);

    for (let course of courses) {
        Logger.log(course.toDetailedString());
    }

    return courses;
}

export function loadCourses() {
    let courseElements = document.querySelectorAll<HTMLDivElement>("div.gradebook-course");

    let courses: SchoologyCourse[] = [];

    for (let courseElement of courseElements) {
        let course = new SchoologyCourse(courseElement);
        courses.push(course);
        course.load();
    }

    return courses;
}

export function getLetterGrade(gradingScale: Record<string, string>, percentage?: number): string {
    if (percentage === undefined) return "?";

    let sorted = Object.keys(gradingScale).sort(
        (a, b) => Number.parseFloat(b) - Number.parseFloat(a)
    );
    for (let s of sorted) {
        if (percentage >= Number.parseInt(s)) {
            return gradingScale[s];
        }
    }
    return "?";
}
