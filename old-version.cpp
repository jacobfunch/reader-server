#include <opencv2/core/core.hpp>
#include <opencv2/features2d/features2d.hpp>
#include <opencv2/nonfree/features2d.hpp>
#include <opencv2/highgui/highgui.hpp>
#include <opencv2/nonfree/nonfree.hpp>
#include <opencv2/flann/flann.hpp>
#include <boost/filesystem.hpp>
#include <iostream>
#include <vector>
#include <algorithm>
#include <chrono>
#include <string>
#include <tuple>
#include <memory>
#include <thread>

using namespace std;
using namespace cv;
using namespace boost::filesystem;

const auto TRAINING_PATH = "./training/";
const auto TEST_PATH = "./tests/";

struct benchmark {

  benchmark() : start(chrono::high_resolution_clock::now()) { }

  void operator()(std::string text) {
    auto end = chrono::high_resolution_clock::now();
    auto diff = chrono::duration_cast<chrono::milliseconds>(end - start);
    cout << text << " done in " << diff.count() << " ms" << endl;
  }

private:
  chrono::time_point<chrono::high_resolution_clock> start;
};

template<typename T>
pair<unique_ptr<DescriptorMatcher>,vector<path>> createMatcher(std::string directory, T detector) {

  // auto matcher = new FlannBasedMatcher(&iparams, &sparams);
  auto matcher = DescriptorMatcher::create("FlannBased");
  vector<path> images;
  benchmark bench_load_training;
  benchmark bench_load;
  for(recursive_directory_iterator iter(directory); iter != recursive_directory_iterator(); ++iter) {
    auto& file = iter->path();
    if(file.filename().string()[0] == '.') continue;

    cout << "Loading image " << file << endl;
    auto image = imread(file.string(), CV_LOAD_IMAGE_GRAYSCALE);
    if(image.rows == 0 || image.cols == 0) {
      cout << " Skipping." << endl;
      continue;
    }
    benchmark bench_image;
    cout << " Image dimensions: " << image.rows << " x " << image.cols << endl;

    auto descriptors = detector(image);
    matcher->add(vector<Mat>(1,descriptors));
    images.push_back(file);
    bench_image("Loading image " + file.string());
  }
  bench_load("Loading images");

  cout << "Training index" << endl;
  benchmark bench_training;
  matcher->train();
  bench_training("Training");
  bench_load_training("Loading and training");

  matcher.addref();
  return make_pair(unique_ptr<DescriptorMatcher>(matcher), move(images));
}

int main(int argc, char *argv[]) {
  benchmark bench_all;

  auto detector = FeatureDetector::create("SIFT"); // FAST
  auto extractor = DescriptorExtractor::create("SIFT"); // FREAK
  auto detectAndCompute = [&](Mat image) -> Mat {
    vector<KeyPoint> keypoints;
    detector->detect(image, keypoints);

    Mat descriptors;
    extractor->compute(image, keypoints, descriptors);
    return descriptors;
  };
  auto data = createMatcher(TRAINING_PATH, detectAndCompute);
  auto matcher = move(get<0>(data));
  const auto images = move(get<1>(data));

  auto doMatch = [&](Mat descriptors, int knn) {
    vector<vector<DMatch>> matches;
    matcher->knnMatch(descriptors, matches, knn);
    return matches;
  };

  auto matchImage = [&](Mat image) {
    auto descriptors = detectAndCompute(image);

    auto matches = doMatch(descriptors, 1);
    vector<int> img_matches(images.size(), 0);
    for(auto& match : matches) {
      img_matches[match[0].imgIdx]++;
    }

    int idx = -1; int max = -1;
    for(int i = 0; i < img_matches.size(); ++i) {
      if(img_matches[i] > max) {
        idx = i;
        max = img_matches[i];
      }
    }
    return make_tuple(images[idx], max, matches.size());
  };

  cout << "--- INPUT ---" << endl;
  while(cin.good()) {
    string filename;
    getline(cin, filename);
    auto image = imread(filename, CV_LOAD_IMAGE_GRAYSCALE);
    equalizeHist( image, image );
    image = image + cv::Scalar(22,22,22);
    auto retval = matchImage(image);
    auto bestImage = get<0>(retval);
    auto matches = get<1>(retval);
    auto total = get<2>(retval);
    cout << bestImage.string() << " " << matches << "/" << total << endl;
  }

  return 0;
}