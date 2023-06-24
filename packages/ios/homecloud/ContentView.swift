//
//  ContentView.swift
//  musicroom
//
//  Created by Aritra Sen on 20/05/23.
//

import SwiftUI
import Libx

class Counter2: LibxCounter, ObservableObject {
    @Published var val: Int = 0
    override func inc(){
        super.inc()
        self.val = self.value
    }
}

struct ContentView: View {
    @ObservedObject var counter: Counter2
    init(){
        counter = Counter2()!
        print("Counter:",counter.toString() as Any)
    }
    var body: some View {
        VStack {
            Text(LibxGreetings("Mr Cat"))
                .padding(.bottom)
            Text(counter.toString())
                .font(.title3)
                .fontWeight(.heavy)
                .foregroundColor(Color.gray)

            Button(action: {
                print("Addd");
                counter.inc();
                print("New counter:",counter.toString() as Any)
            }) {
                Text("Add")
            }
            SwiftUIWebView()
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
