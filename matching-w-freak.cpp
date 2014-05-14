#include <opencv2/core/core.hpp>
#include <opencv2/highgui/highgui.hpp>
#include <opencv2/features2d/features2d.hpp>
#include <opencv2/nonfree/features2d.hpp>
#include <opencv2/flann/flann.hpp>
#include <opencv2/legacy/legacy.hpp>
#include "opencv2/calib3d/calib3d.hpp"
#include "opencv2/imgproc/imgproc.hpp"
#include "opencv2/nonfree/nonfree.hpp"
#include <boost/filesystem.hpp>
#include <list>
#include <string>
#include <iostream>
#include <vector>
#include <algorithm>
#include <iterator>
#include <memory>
#include <thread>
#include <stdlib.h>
#include <sstream>

using namespace cv;
using namespace std;
using namespace boost::filesystem;

const auto TRAINING_PATH = "./train/";
const auto OCR_OUTPUT_PATH = "./ocr/";

vector<Point2f> track_marker(Mat& image)
{
    // Convert the image into an HSV image
    Mat imgHSV = Mat::zeros(image.size(), CV_8UC3);
    cv::cvtColor(image, imgHSV, CV_BGR2HSV);

    Mat imgThreshed = Mat::zeros(image.size(), CV_8UC1);

    // PS ranges from 1-360 and 1-100
    // Multiply by 180/360 for the H value
    // Multiple by 255/100 for the S and V value
    cv::inRange(imgHSV, cv::Scalar(50, 80, 80), cv::Scalar(100, 255, 255), imgThreshed);
    //imshow("imgThreshed", imgThreshed);

    vector<vector<Point> > contours;
    vector<Vec4i> hierarchy;
    findContours( imgThreshed, contours, hierarchy, CV_RETR_TREE, CV_CHAIN_APPROX_SIMPLE, Point(0, 0) );

    if (contours.empty()) {
        return vector<Point2f>();
    }

    vector<Point2f> candidates;
    auto largest_area = 0;
    for (auto contour : contours) {
        double a = contourArea(contour, false);
        if (a > largest_area) {
            largest_area = a;

            Point leftmost = contour[0];
            Point rightmost = contour[0];
            for (auto p : contour) {
                if (p.x < leftmost.x) {
                    leftmost = p;
                }
                if (p.x > rightmost.x) {
                    rightmost = p;
                }
            }

            if (abs(leftmost.x - rightmost.x) > 10) {
                candidates.push_back(Point2f(leftmost.x - 3, leftmost.y + 5)); // Addition to corregate for pencil shape
            }
        }
    }

    return candidates;
};

int tester() {
    auto detector = FeatureDetector::create("SURF");
    FREAK extractor;
    BFMatcher matcher(NORM_HAMMING, false);

    Mat image1 = imread("./glassImage_34.jpg", 0);
    Mat image2 = imread("./train/Page280.jpg", 0);

    Mat image3 = imread("./glassImage_34.jpg");

    vector<Point2f> marker_candidates = track_marker(image3);
    for (auto marker_candidate : marker_candidates) {
        cv::circle(image3, marker_candidate, 5, CV_RGB(0,255,0), 2);
    }

    imshow("Marker", image3);

    Mat descriptorsA, descriptorsB;
    vector<KeyPoint> keypointsA, keypointsB;

    detector->detect(image1, keypointsA);
    extractor.compute(image1, keypointsA, descriptorsA);

    detector->detect(image2, keypointsB);
    extractor.compute(image2, keypointsB, descriptorsB);

    vector<vector<cv::DMatch> > matches;
    vector<vector<cv::DMatch> > nmatches;
    matcher.knnMatch(descriptorsA, descriptorsB, nmatches, 2);

    vector<vector<DMatch>> knmatches;
    for(int i=0; i<nmatches.size(); i++)
    {
        if((nmatches[i].size()==1)||(abs(nmatches[i][0].distance/nmatches[i][1].distance)<0.8))
        {
            knmatches.push_back(nmatches[i]);
        }
    }
    matches=knmatches;

    Mat imgMatch;
    drawMatches(image1, keypointsA, image2, keypointsB, matches, imgMatch);

    copyMakeBorder( imgMatch, imgMatch, 0, 600, 0, 0, BORDER_CONSTANT, Scalar(255,255,255) );

    vector<Point2f> obj;
    vector<Point2f> scene;

    for( int j = 0; j < matches.size(); j++ )
    {
        obj.push_back( keypointsB[ matches[j][0].trainIdx ].pt );
        scene.push_back( keypointsA[ matches[j][0].queryIdx ].pt );
    }

    Mat H = findHomography( obj, scene, CV_RANSAC );

    vector<Point2f> obj_corners(4);
    obj_corners[0] = cvPoint(0,0); obj_corners[1] = cvPoint( image2.cols, 0 );
    obj_corners[2] = cvPoint( image2.cols, image2.rows ); obj_corners[3] = cvPoint( 0, image2.rows );
    vector<Point2f> scene_corners(4);

    perspectiveTransform( obj_corners, scene_corners, H);

    // Draw lines between the corners (the mapped object in the scene)
    line( imgMatch, scene_corners[0], scene_corners[1], Scalar(0, 255, 0), 4 );
    line( imgMatch, scene_corners[1], scene_corners[2], Scalar(0, 255, 0), 4 );
    line( imgMatch, scene_corners[2], scene_corners[3], Scalar(0, 255, 0), 4 );
    line( imgMatch, scene_corners[3], scene_corners[0], Scalar(0, 255, 0), 4 );

    resize(imgMatch, imgMatch, Size(), 0.5, 0.5);
    imshow("matches", imgMatch);
    waitKey(0);

    return 0;
}

struct benchmark {
    benchmark() : start(chrono::high_resolution_clock::now()) { }

    void operator()(std::string text) {
        auto end = chrono::high_resolution_clock::now();
        auto diff = chrono::duration_cast<chrono::milliseconds>(end - start);
        cout << text << " in " << diff.count() << " ms" << endl;
    }

private:
    chrono::time_point<chrono::high_resolution_clock> start;
};

template<typename T>
pair<vector<vector<KeyPoint>>, vector<Mat>> createMatcher(pair<vector<path>, vector<Mat>>& images, T detectAndCompute) {
    vector<vector<KeyPoint>> trained_keypoints;
    vector<Mat> trained_descriptors;
    vector<path> path;
    vector<Mat> img;

    for (recursive_directory_iterator iter(TRAINING_PATH); iter != recursive_directory_iterator(); ++iter) {
        auto& file = iter->path();
        if (file.filename().string()[0] == '.') continue;
        
        auto image = imread(file.string(), CV_LOAD_IMAGE_GRAYSCALE);
        if (image.rows == 0 || image.cols == 0) {
            cout << " Skipping." << endl;
            continue;
        }

        Mat image_compressed;
        resize(image, image_compressed, Size(), 0.8, 0.8);

        vector<KeyPoint> keypoints;
        Mat descriptors;

        detectAndCompute(image_compressed, keypoints, descriptors);

        trained_keypoints.push_back(keypoints);
        trained_descriptors.push_back(descriptors);

        path.push_back(file);
        img.push_back(image_compressed);

        // OCR loop
        ostringstream oss;
        oss << "tesseract " << file.string() << " " << OCR_OUTPUT_PATH << file.filename().string() << " hocr";
        system(oss.str().c_str());
    }

    images = make_pair(path, img);

    return make_pair(trained_keypoints, trained_descriptors);
}

int main()
{
    //int Tester = tester();

    auto detector = FeatureDetector::create("SURF");
    FREAK extractor;
    BFMatcher matcher(NORM_HAMMING, false);

    auto detectAndCompute = [&](Mat image, vector<KeyPoint>& keypoints, Mat& descriptors) -> int {
        detector->detect(image, keypoints);
        extractor.compute(image, keypoints, descriptors);

        return 0;
    };

    benchmark bench_train;

    pair<vector<path>, vector<Mat>> images;
    auto data = createMatcher(images, detectAndCompute);
    auto trained_keypoints = move(get<0>(data));
    auto trained_descriptors = move(get<1>(data));

    bench_train(to_string(move(get<0>(images)).size()) + " images trained");

    auto matchImage = [&](Mat image_original) {
        Mat image;
        cvtColor(image_original, image, CV_BGR2GRAY);

        // Preprocessing query image
        equalizeHist(image, image);
        image = image + Scalar(22, 22, 22);

        double remove_pixels_percent = 0.15;
        for (int i=0; i<image.rows; i++) {
            for (int j=0; j<image.cols; j++) {
                int pixel = image.at<uchar>(i,j);

                // We try to remove false matches:
                // Paint pixels that are far from white or black, and paint pixels near the frame.
                if ( (pixel > 50 && pixel < 200) ||
                     j < image.cols * remove_pixels_percent ||
                     j > image.cols - image.cols * remove_pixels_percent )
                    image.at<uchar>(i,j) = 0;
            }
        }

        vector<KeyPoint> keypoints_query;
        Mat descriptors_query;

        detectAndCompute(image, keypoints_query, descriptors_query);

        benchmark bench_match;
        benchmark bench_first_match;

        for (int i = 0; i < move(get<0>(images)).size(); i++)
        {
            Mat descriptors;
            vector<KeyPoint> keypoints;

            descriptors = trained_descriptors[i];
            keypoints = trained_keypoints[i];
            
            vector<vector<cv::DMatch> > matches;

            matcher.knnMatch(descriptors_query, descriptors, matches, 2);

            vector<vector<DMatch>> knmatches;
            for (int i=0; i<matches.size(); i++)
            {
                if ((matches[i].size()==1)||(abs(matches[i][0].distance/matches[i][1].distance)<0.8))
                {
                    knmatches.push_back(matches[i]);
                }
            }
            matches = knmatches;

            vector<Point2f> obj;
            vector<Point2f> scene;

            for( int j = 0; j < matches.size(); j++ )
            {
                obj.push_back( keypoints[ matches[j][0].trainIdx ].pt );
                scene.push_back( keypoints_query[ matches[j][0].queryIdx ].pt );
            }

            Mat H = findHomography( obj, scene, CV_RANSAC );

            vector<Point2f> obj_corners(4);
            obj_corners[0] = cvPoint(0,0); obj_corners[1] = cvPoint( image.cols, 0 );
            obj_corners[2] = cvPoint( image.cols, image.rows ); obj_corners[3] = cvPoint( 0, image.rows );
            vector<Point2f> scene_corners(4);

            perspectiveTransform( obj_corners, scene_corners, H);

            int top_line_length = sqrt(pow(scene_corners[0].x - scene_corners[1].x, 2) + pow(scene_corners[0].y - scene_corners[1].y, 2));
            int bottom_line_length = sqrt(pow(scene_corners[2].x - scene_corners[3].x, 2) + pow(scene_corners[2].y - scene_corners[3].y, 2));

            double angleTolerance = 25;

            double horizontal_top_angle = (atan((double)(scene_corners[1].y - scene_corners[0].y) / (scene_corners[1].x - scene_corners[0].x)) * 180.) / 3.14;
            double vertical_right_angle = (atan((double)(scene_corners[2].y - scene_corners[1].y) / (scene_corners[2].x - scene_corners[1].x)) * 180.) / 3.14;
            double horizontal_bottom_angle = (atan((double)(scene_corners[3].y - scene_corners[2].y) / (scene_corners[3].x - scene_corners[2].x)) * 180.) / 3.14;
            double vertical_left_angle = (atan((double)(scene_corners[0].y - scene_corners[3].y) / (scene_corners[0].x - scene_corners[3].x)) * 180.) / 3.14;

            cout << "Checking: " << move(get<0>(images))[i] << endl;

            if (top_line_length > get<1>(images)[i].cols * 0.25 &&
                bottom_line_length > get<1>(images)[i].cols * 0.25 &&
                (abs(horizontal_top_angle - vertical_right_angle) > 90 - angleTolerance) &&
                (abs(horizontal_bottom_angle - vertical_right_angle) > 90 - angleTolerance) &&
                (abs(horizontal_bottom_angle - vertical_left_angle) > 90 - angleTolerance) &&
                (abs(horizontal_top_angle - vertical_left_angle) > 90 - angleTolerance)) {
                bench_first_match(" > We found a match");

                // We inverse the H matrix, because the transform given is trained -> query, we need to opposite way.
                H = H.inv(1);

                vector<Point2f> marker_candidates = track_marker(image_original);
                vector<Point2f> marker_output(marker_candidates.size());
                if ( marker_candidates.size() == 0 ) {
                    cout << "Marker not found, so we won't do more." << endl;
                    return;
                }

                cout << marker_candidates << endl;

                Point2f correct_marker;
                perspectiveTransform( marker_candidates, marker_output, H );
                for (auto marker_point : marker_output) {

                    // Lets remove potential markers off the paper.
                    if ( marker_point.x > 0 && marker_point.x < get<1>(images)[i].cols &&
                         marker_point.y > 0 && marker_point.y < get<1>(images)[i].rows) {
                        correct_marker = marker_point;
                    }
                }

                double new_x = correct_marker.x / get<1>(images)[i].cols;
                double new_y = correct_marker.y / get<1>(images)[i].rows;

                // Mat srcMat(3, 1, CV_64F);
                // srcMat.at<double>(0,0) = 474;
                // srcMat.at<double>(1,0) = 470;
                // srcMat.at<double>(2,0) = 1.0;

                // // Send back XY coordinates in percent to the OCR extractor.
                // Mat dstMat = H * srcMat;
                // double new_x = dstMat.at<double>(0,0) / dstMat.at<double>(2,0)/move(get<1>(images))[i].cols;
                // double new_y = (dstMat.at<double>(1,0) / dstMat.at<double>(2,0))/move(get<1>(images))[i].rows;

                auto path = move(get<0>(images))[i].string();
                auto filename = path.substr(path.find_last_of('/')+1);

                cout << " >> File: " << filename <<  " XY: " << new_x << ", " << new_y << endl;

                // This is another method for calculating the X,Y coordinate.
                // vector<Point2f> marker_point(1);
                // vector<Point2f> output_point(1);

                // marker_point[0] = Point(474, 470);
                // perspectiveTransform( marker_point, output_point, H);
                // cout << "Testing other method: " << output_point << endl;

                break;
            }
        }

        bench_match("All matches done");
    };

    cout << "--- INPUT ---" << endl;
    while(cin.good()) {
        string filename;
        getline(cin, filename);
        Mat image = imread(filename);
        matchImage(image);
    }

    return 0;
}