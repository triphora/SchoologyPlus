// Content script
import "../styles/all.css";
import "../styles/modern/all.scss";
import { initializeAnalytics } from "./utils/analytics";

// In case you want to import an SVG file, you can do it like this:
// import svgIcon from '../static/icons/icon.svg'

initializeAnalytics();